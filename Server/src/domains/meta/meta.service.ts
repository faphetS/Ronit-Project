import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { classifyLead, type Classification } from "../../lib/classify.js";
import {
  isMessageProcessed,
  markMessageProcessed,
  unmarkMessageProcessed,
  findKnownSender,
  upsertKnownSender,
  updateSenderPhone,
  deleteKnownSenderByItemId,
} from "../../lib/dedup.js";
import {
  getPendingClarification,
  upsertPendingClarification,
  incrementReaskCount,
  clearPendingClarification,
  deletePendingByItemId,
} from "../../lib/conversation.js";
import {
  createLeadRow,
  updateItemPhone,
  updateItemService,
  updateLastIgMessage,
  getItemBoardAndGroup,
  moveItemToGroup,
  leadGroupForPhone,
  mapItemServiceToKey,
} from "../monday/monday.service.js";
import { findLeadOnActiveServiceBoards } from "../monday/monday.webhook.service.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import { enqueueMondayLead, findQueuedLeadBySender } from "../../config/db.js";
import { maybeSendUmanWelcome } from "../whatsapp/uman-welcome.service.js";
import { sendReplyDM, sendServiceQuestion, sendPhoneThanks } from "./meta.outbound.service.js";
import { fetchIgProfile } from "./meta.profile.service.js";

// Cap on how many times we re-ask "challah or uman?" when she keeps replying
// without naming a service. After the cap we stay silent (the pending row is
// kept, so a later service mention still gets answered).
const MAX_REASKS = 3;

// Service-column update is best-effort: a transient Monday failure here must NOT
// abort the critical path (phone capture, move-back, reply DM, clearing pending).
async function safeUpdateService(
  itemId: string,
  service: "uman" | "challah",
): Promise<void> {
  try {
    await updateItemService(itemId, service);
  } catch (err) {
    logger.warn(
      { err, itemId, service },
      "updateItemService failed — continuing (non-fatal)",
    );
  }
}

// DM sends are best-effort — a transient IG API blip must not abort lead creation.
async function safeSendReplyDM(
  senderId: string,
  opts: { service: "uman" | "challah"; hasPhone: boolean; answered: boolean },
): Promise<void> {
  try {
    await sendReplyDM(senderId, opts);
  } catch (err) {
    logger.warn({ err, senderId }, "sendReplyDM failed — continuing (non-fatal)");
  }
}

async function safeSendServiceQuestion(senderId: string): Promise<void> {
  try {
    await sendServiceQuestion(senderId);
  } catch (err) {
    logger.warn({ err, senderId }, "sendServiceQuestion failed — continuing (non-fatal)");
  }
}

async function safeSendPhoneThanks(senderId: string): Promise<void> {
  try {
    await sendPhoneThanks(senderId);
  } catch (err) {
    logger.warn({ err, senderId }, "sendPhoneThanks failed — continuing (non-fatal)");
  }
}

// First-contact DM/question. Shared by the happy-path create and the
// rate-limited-create catch below. The Uman WhatsApp welcome only fires when
// a `mondayItemId` is supplied (the normal create path) — a deferred create
// has no item yet, and Monday's own create_item "lead-ready" webhook
// (monday.controller handleLeadReady) fires the welcome once the queue
// eventually creates the row, so there is exactly one dedup key (the item
// id) across both paths instead of one keyed on `senderId` racing another
// keyed on `mondayItemId`.
async function sendFirstContactSequence(
  senderId: string,
  service: "uman" | "challah" | null,
  phone: string | null,
  mondayItemId?: string,
): Promise<void> {
  if (service !== null) {
    await safeSendReplyDM(senderId, { service, hasPhone: !!phone, answered: false });
  } else {
    await safeSendServiceQuestion(senderId);
  }

  if (!mondayItemId) return;

  void maybeSendUmanWelcome({
    senderId,
    mondayItemId,
    service,
    phone,
  }).catch((err) => logger.error({ err }, "Uman welcome rejected unexpectedly"));
}

// Shared log-and-skip for a rate limit hit on an UPDATE to an already-existing
// Monday row (pending-clarification or known-sender branches). The row stays
// where it is; if this message carried a phone or service answer that Monday
// never received, durably retry just that write via the queue (merge-safe —
// the upsert coalesces onto any row already queued for this sender).
function handleUpdatePathRateLimit(
  input: { senderId?: string; senderUsername?: string; messageText: string },
  classification: Classification,
  mondayItemId: string,
  currentPhone: string | null,
  err: MondayRateLimitError,
): { itemId: string | null; classification: Classification } {
  logger.warn(
    {
      err,
      senderId: input.senderId,
      mondayItemId,
      extractedPhone: classification.extractedPhone,
    },
    "Monday rate-limited on known-sender/pending update — log-and-skip (row already exists)",
  );

  if (input.senderId && (classification.extractedPhone || classification.service !== null)) {
    enqueueMondayLead({
      platform: "instagram",
      senderId: input.senderId,
      senderUsername: input.senderUsername,
      displayName: input.senderUsername ?? "Unknown IG lead",
      phone: classification.extractedPhone ?? currentPhone,
      service: classification.service,
      messageText: input.messageText,
      source: "instagram",
    });
  }

  return { itemId: mondayItemId, classification };
}

async function processClassifiedMessage(
  input: {
    messageText: string;
    senderId?: string;
    senderUsername?: string;
    messageId?: string;
  },
  classification: Classification,
): Promise<{ itemId: string | null; classification: Classification }> {
  let stalePhone: string | null = null;

  // BLOCK 0 — pending service clarification. A pending sender is also a known
  // sender (we created the row + mapping when we asked), so this MUST run before
  // the known-sender branch below or her answer would be silently swallowed.
  const pending = input.senderId
    ? getPendingClarification("instagram", input.senderId)
    : null;

  if (pending) {
    // Persist a newly-offered phone to SQLite BEFORE the first Monday await in
    // this branch, so it survives even if every Monday call below fails.
    const capturedPhone =
      classification.extractedPhone && !pending.phone ? classification.extractedPhone : null;
    if (capturedPhone) {
      updateSenderPhone("instagram", input.senderId!, capturedPhone);
    }

    try {
      const live = await getItemBoardAndGroup(pending.monday_item_id);

      if (live === null || live.boardId !== env.MONDAY_BOARD_CRM_ID) {
        logger.warn(
          {
            senderId: input.senderId,
            mondayItemId: pending.monday_item_id,
            liveBoardId: live?.boardId ?? null,
          },
          "Stale pending clarification — treating sender as new",
        );
        deletePendingByItemId(pending.monday_item_id);
        deleteKnownSenderByItemId(pending.monday_item_id);
        stalePhone = pending.phone;
        // fall through to the new-sender path below.
      } else {
        await updateLastIgMessage(pending.monday_item_id, input.messageText);

        // She explicitly declined mid-clarification → end it and stay silent.
        // Clearing the pending row stops further re-asks and avoids a stale row.
        if (!classification.interested) {
          // A phone handed over even while declining still moves a tracked lead
          // back to new-leads — phone presence is the sole gate. With no phone we
          // leave her where she sits (don't disturb placement on a decline).
          if (capturedPhone) {
            await updateItemPhone(pending.monday_item_id, capturedPhone);
          }
          const declinePhone = classification.extractedPhone ?? pending.phone;
          if (declinePhone) {
            const declineTarget = leadGroupForPhone(declinePhone);
            if (live.groupId !== declineTarget) {
              await moveItemToGroup(pending.monday_item_id, declineTarget);
            }
          }
          clearPendingClarification("instagram", input.senderId!);
          logger.info(
            { senderId: input.senderId, mondayItemId: pending.monday_item_id },
            "Pending lead not interested — clarification cleared, staying silent",
          );
          return { itemId: pending.monday_item_id, classification };
        }

        // (a) She named a service → finalize with the post-question reply.
        if (classification.interested && classification.service !== null) {
          await safeUpdateService(pending.monday_item_id, classification.service);

          if (capturedPhone) {
            await updateItemPhone(pending.monday_item_id, capturedPhone);
          }

          const target = leadGroupForPhone(pending.phone ?? classification.extractedPhone);
          if (live.groupId !== target) {
            await moveItemToGroup(pending.monday_item_id, target);
          }

          const hasPhone = !!(pending.phone || classification.extractedPhone);
          await safeSendReplyDM(input.senderId!, {
            service: classification.service,
            hasPhone,
            answered: true,
          });

          clearPendingClarification("instagram", input.senderId!);
          logger.info(
            {
              senderId: input.senderId,
              mondayItemId: pending.monday_item_id,
              service: classification.service,
            },
            "Pending clarification resolved — service answered",
          );

          // Service just confirmed → if uman + phone, send the WhatsApp welcome
          // (fire-and-forget; it has its own inter-bubble delay).
          void maybeSendUmanWelcome({
            senderId: input.senderId!,
            mondayItemId: pending.monday_item_id,
            service: classification.service,
            phone: pending.phone ?? classification.extractedPhone,
          }).catch((err) => logger.error({ err }, "Uman welcome rejected unexpectedly"));

          return { itemId: pending.monday_item_id, classification };
        }

        // (b) Still no service. Capture a phone if she offered one, then re-ask
        // (under the cap). If she ghosts we never get here — no proactive sends.
        if (classification.interested && capturedPhone) {
          await updateItemPhone(pending.monday_item_id, capturedPhone);
          upsertPendingClarification({
            platform: "instagram",
            senderId: input.senderId!,
            mondayItemId: pending.monday_item_id,
            phone: capturedPhone,
          });
          if (live.groupId !== env.MONDAY_GROUP_NEW_LEADS_ID) {
            await moveItemToGroup(pending.monday_item_id, env.MONDAY_GROUP_NEW_LEADS_ID);
          }
        }

        if (pending.reask_count < MAX_REASKS) {
          await safeSendServiceQuestion(input.senderId!);
          incrementReaskCount("instagram", input.senderId!);
          logger.info(
            {
              senderId: input.senderId,
              mondayItemId: pending.monday_item_id,
              reaskCount: pending.reask_count + 1,
            },
            "Pending clarification — re-asked service question",
          );
        } else {
          logger.info(
            { senderId: input.senderId, mondayItemId: pending.monday_item_id },
            "Pending clarification re-ask cap reached — staying silent",
          );
        }
        return { itemId: pending.monday_item_id, classification };
      }
    } catch (err) {
      if (err instanceof MondayRateLimitError) {
        return handleUpdatePathRateLimit(
          input,
          classification,
          pending.monday_item_id,
          pending.phone,
          err,
        );
      }
      throw err;
    }
  }

  const existing = input.senderId
    ? findKnownSender("instagram", input.senderId)
    : null;

  if (existing) {
    const mondayItemId = existing.monday_item_id;

    // Persist a newly-offered phone to SQLite BEFORE the first Monday await in
    // this branch, so it survives even if every Monday call below fails.
    const capturedPhone =
      classification.extractedPhone && !existing.phone ? classification.extractedPhone : null;
    if (capturedPhone) {
      updateSenderPhone("instagram", input.senderId!, capturedPhone);
    }

    try {
      const live = await getItemBoardAndGroup(mondayItemId);

      if (live === null || live.boardId !== env.MONDAY_BOARD_CRM_ID) {
        logger.warn(
          { senderId: input.senderId, mondayItemId, liveBoardId: live?.boardId ?? null },
          "Stale known_senders mapping — treating sender as new",
        );
        deleteKnownSenderByItemId(mondayItemId);
        deletePendingByItemId(mondayItemId);
        stalePhone = existing.phone;
      } else {
        // Live row on CRM — update last IG message on every message.
        await updateLastIgMessage(mondayItemId, input.messageText);

        // Phone capture + re-file run on EVERY message, even a not-interested one:
        // a tracked lead handing over a number should always move back to new-leads,
        // regardless of how that single message happens to classify.
        if (capturedPhone) {
          await updateItemPhone(mondayItemId, capturedPhone);
          logger.info(
            { senderId: input.senderId, mondayItemId },
            "Updated phone on existing lead instead of creating duplicate",
          );
          // Uman-only thank-you for handing over the phone after being asked.
          // capturedPhone is set only the first time a phone arrives (stored
          // phone empties the condition), so this can never re-fire.
          const serviceKey = classification.service ?? mapItemServiceToKey(live.service);
          if (serviceKey === "uman") {
            await safeSendPhoneThanks(input.senderId!);
          }
        }

        // Re-file by phone presence. A phone always pulls a tracked lead back to
        // new-leads — even on a not-interested message (phone presence is the sole
        // gate). With no phone, only an *interested* message re-files (into the
        // no-phone group); a not-interested message never disturbs the lead's
        // current placement (e.g. a follow-up group).
        const phone = classification.extractedPhone ?? existing.phone;
        if (phone || classification.interested) {
          const target = leadGroupForPhone(phone);
          if (live.groupId !== target) {
            await moveItemToGroup(mondayItemId, target);
            logger.info(
              { senderId: input.senderId, mondayItemId, fromGroupId: live.groupId, target },
              "Returning lead re-filed by phone presence",
            );
          }
        }

        // An existing CRM lead who hands over a phone gets the Uman welcome no
        // matter how THIS message classifies — they were already classified
        // interested when the row was created, so we never re-require it. Runs
        // ABOVE the not-interested gate (a bare-number reply often classifies
        // not-interested). Fire-and-forget — it has its own inter-bubble delay, so
        // we don't hold the Meta webhook open. Service comes from this message or
        // the stored Monday label.
        void maybeSendUmanWelcome({
          senderId: input.senderId!,
          mondayItemId,
          service: classification.service ?? mapItemServiceToKey(live.service),
          phone,
        }).catch((err) => logger.error({ err }, "Uman welcome rejected unexpectedly"));

        if (!classification.interested) {
          logger.info(
            {
              senderUsername: input.senderUsername,
              confidence: classification.confidence,
            },
            "Lead classified as not interested — phone/move/welcome applied, skipping service update",
          );
          return { itemId: mondayItemId, classification };
        }

        // Fill the service column only if it is currently empty — never overwrite
        // a confirmed service from a casual (possibly misclassified) mention.
        if (classification.service !== null && live.service === null) {
          await safeUpdateService(mondayItemId, classification.service);
        }

        return { itemId: mondayItemId, classification };
      }
    } catch (err) {
      if (err instanceof MondayRateLimitError) {
        return handleUpdatePathRateLimit(input, classification, mondayItemId, existing.phone, err);
      }
      throw err;
    }
  }

  // Queue-aware guard — this sender already has a create durably deferred in
  // monday_lead_queue (awaiting a rate-limit reset). Merge this message into
  // that row and stay silent, REGARDLESS of this message's interested flag —
  // a bare phone number often classifies not-interested, and that phone is
  // exactly the datum this guard must not drop. Firing another first-contact
  // DM here would duplicate it (no known_senders row exists yet to dedup on),
  // and creating directly would race the drain into a duplicate CRM row once
  // it succeeds.
  if (input.senderId) {
    const queued = findQueuedLeadBySender("instagram", input.senderId);
    if (queued) {
      enqueueMondayLead({
        platform: "instagram",
        senderId: input.senderId,
        senderUsername: input.senderUsername,
        displayName: queued.display_name,
        phone: classification.extractedPhone ?? stalePhone,
        service: classification.service,
        messageText: input.messageText,
        source: "instagram",
      });
      logger.info(
        { senderId: input.senderId },
        "Message from an already-queued sender — merged into monday_lead_queue, no DM sent",
      );
      return { itemId: null, classification };
    }
  }

  if (!classification.interested) {
    logger.info(
      {
        senderUsername: input.senderUsername,
        confidence: classification.confidence,
      },
      "Lead classified as not interested — skipping Monday create/update",
    );
    return { itemId: null, classification };
  }

  // New-sender path (existing === null, interested).
  let igUsername: string | null = null;
  let displayName = "Unknown IG lead";
  if (input.senderId) {
    const profile = await fetchIgProfile(input.senderId);
    if (profile?.username) {
      igUsername = profile.username;
      displayName = profile.username;
    }
  }

  const phone = classification.extractedPhone ?? stalePhone;

  try {
    // Before creating a CRM row, check whether this lead is already on an active
    // service board (applies when classification named a specific service).
    if (classification.service !== null) {
      const phones = [classification.extractedPhone, stalePhone].filter(
        (p): p is string => !!p,
      );
      const searchName = igUsername ?? input.senderUsername ?? null;

      const hit = await findLeadOnActiveServiceBoards(classification.service, phones, searchName);
      if (hit) {
        logger.info(
          {
            senderId: input.senderId,
            boardId: hit.boardId,
            serviceItemId: hit.itemId,
            service: classification.service,
          },
          "Lead already on active service board — skipping CRM row creation",
        );
        return { itemId: null, classification };
      }
    }

    const { itemId } = await createLeadRow({
      name: displayName,
      phone,
      service: classification.service,
      source: "instagram",
    });

    if (input.senderId) {
      upsertKnownSender({
        platform: "instagram",
        senderId: input.senderId,
        senderUsername: igUsername ?? input.senderUsername,
        mondayItemId: itemId,
        phone,
      });

      // Entry B step 1 — vague lead (no service named). Open a clarification right
      // after the row + mapping (both synchronous below) and before any further
      // await, to shrink the window where a fast second message misses it.
      if (classification.service === null) {
        upsertPendingClarification({
          platform: "instagram",
          senderId: input.senderId,
          mondayItemId: itemId,
          phone,
        });
      }
    }

    await updateLastIgMessage(itemId, input.messageText);

    if (input.senderId) {
      await sendFirstContactSequence(input.senderId, classification.service, phone, itemId);
    }

    return { itemId, classification };
  } catch (err) {
    if (err instanceof MondayRateLimitError && input.senderId) {
      enqueueMondayLead({
        platform: "instagram",
        senderId: input.senderId,
        senderUsername: igUsername ?? input.senderUsername,
        displayName,
        phone,
        service: classification.service,
        messageText: input.messageText,
        source: "instagram",
        openClarification: classification.service === null,
      });

      logger.warn(
        { err, senderId: input.senderId },
        "Monday rate-limited on new lead creation — deferred to monday_lead_queue",
      );

      // No mondayItemId yet, so this skips the welcome (see sendFirstContactSequence) —
      // Monday's own create_item lead-ready webhook fires it once the queue creates the row.
      await sendFirstContactSequence(input.senderId, classification.service, phone);

      return { itemId: null, classification };
    }
    throw err;
  }
}

export async function handleIncomingMessage(input: {
  messageText: string;
  senderId?: string;
  senderUsername?: string;
  messageId?: string;
}): Promise<{ itemId: string | null; classification: Classification }> {
  if (input.messageId && isMessageProcessed("meta", input.messageId)) {
    logger.info({ messageId: input.messageId }, "Skipping duplicate webhook message");
    return {
      itemId: null,
      classification: {
        interested: false,
        service: null,
        extractedName: null,
        extractedPhone: null,
        confidence: 0,
        rawResponse: "",
      },
    };
  }

  const classification = await classifyLead(input);

  if (input.messageId) {
    markMessageProcessed("meta", input.messageId);
  }

  try {
    return await processClassifiedMessage(input, classification);
  } catch (err) {
    if (input.messageId) {
      unmarkMessageProcessed("meta", input.messageId);
    }
    throw err;
  }
}
