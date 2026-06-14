import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { classifyLead, type Classification } from "../../lib/classify.js";
import {
  isMessageProcessed,
  markMessageProcessed,
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
  findLeadOnBoard,
} from "../monday/monday.service.js";
import { getActiveServiceBoardIds } from "../monday/monday.webhook.service.js";
import { sendReplyDM, sendServiceQuestion } from "./meta.outbound.service.js";
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

  let stalePhone: string | null = null;

  // BLOCK 0 — pending service clarification. A pending sender is also a known
  // sender (we created the row + mapping when we asked), so this MUST run before
  // the known-sender branch below or her answer would be silently swallowed.
  const pending = input.senderId
    ? getPendingClarification("instagram", input.senderId)
    : null;

  if (pending) {
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

        if (classification.extractedPhone && !pending.phone) {
          await updateItemPhone(pending.monday_item_id, classification.extractedPhone);
          updateSenderPhone("instagram", input.senderId!, classification.extractedPhone);
        }

        if (live.groupId !== env.MONDAY_GROUP_NEW_LEADS_ID) {
          await moveItemToGroup(pending.monday_item_id, env.MONDAY_GROUP_NEW_LEADS_ID);
        }

        const hasPhone = !!(pending.phone || classification.extractedPhone);
        await sendReplyDM(input.senderId!, {
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
        return { itemId: pending.monday_item_id, classification };
      }

      // (b) Still no service. Capture a phone if she offered one, then re-ask
      // (under the cap). If she ghosts we never get here — no proactive sends.
      if (classification.interested && classification.extractedPhone && !pending.phone) {
        await updateItemPhone(pending.monday_item_id, classification.extractedPhone);
        updateSenderPhone("instagram", input.senderId!, classification.extractedPhone);
        upsertPendingClarification({
          platform: "instagram",
          senderId: input.senderId!,
          mondayItemId: pending.monday_item_id,
          phone: classification.extractedPhone,
        });
      }

      if (pending.reask_count < MAX_REASKS) {
        await sendServiceQuestion(input.senderId!);
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
  }

  const existing = input.senderId
    ? findKnownSender("instagram", input.senderId)
    : null;

  if (existing) {
    const mondayItemId = existing.monday_item_id;
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

      if (!classification.interested) {
        logger.info(
          {
            senderUsername: input.senderUsername,
            confidence: classification.confidence,
          },
          "Lead classified as not interested — skipping Monday create/update",
        );
        return { itemId: mondayItemId, classification };
      }

      // Fill the service column only if it is currently empty — never overwrite
      // a confirmed service from a casual (possibly misclassified) mention.
      if (classification.service !== null && live.service === null) {
        await safeUpdateService(mondayItemId, classification.service);
      }

      // Interested + live row — update phone if newly captured.
      if (classification.extractedPhone && !existing.phone) {
        await updateItemPhone(mondayItemId, classification.extractedPhone);
        updateSenderPhone("instagram", input.senderId!, classification.extractedPhone);
        logger.info(
          { senderId: input.senderId, mondayItemId },
          "Updated phone on existing lead instead of creating duplicate",
        );
      } else {
        logger.info(
          { senderId: input.senderId, mondayItemId },
          "Sender already has a CRM row — skipping duplicate creation",
        );
      }

      // Move back to new-leads if the row drifted to another group.
      if (live.groupId !== env.MONDAY_GROUP_NEW_LEADS_ID) {
        await moveItemToGroup(mondayItemId, env.MONDAY_GROUP_NEW_LEADS_ID);
        logger.info(
          { senderId: input.senderId, mondayItemId, fromGroupId: live.groupId },
          "Returning interested lead moved back to new-leads group",
        );
      }

      return { itemId: mondayItemId, classification };
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

  // Before creating a CRM row, check whether this lead is already on an active
  // service board (applies when classification named a specific service).
  if (classification.service !== null) {
    const phones = [classification.extractedPhone, stalePhone].filter(
      (p): p is string => !!p,
    );
    const searchName = igUsername ?? input.senderUsername ?? null;

    if (phones.length > 0 || searchName !== null) {
      const boardIds = await getActiveServiceBoardIds(classification.service);
      for (const boardId of boardIds) {
        const hit = await findLeadOnBoard(boardId, phones, searchName);
        if (hit) {
          logger.info(
            {
              senderId: input.senderId,
              boardId,
              serviceItemId: hit.itemId,
              service: classification.service,
            },
            "Lead already on active service board — skipping CRM row creation",
          );
          return { itemId: null, classification };
        }
      }
    }
  }

  const phone = classification.extractedPhone ?? stalePhone;

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
    if (classification.service !== null) {
      // Entry A — service named upfront.
      await sendReplyDM(input.senderId, {
        service: classification.service,
        hasPhone: !!phone,
        answered: false,
      });
    } else {
      // Entry B step 1 — ask which service.
      await sendServiceQuestion(input.senderId);
    }
  }

  return { itemId, classification };
}
