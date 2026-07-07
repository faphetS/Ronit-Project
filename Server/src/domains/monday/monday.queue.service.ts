import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import {
  getDueQueuedLeads,
  deleteQueuedLead,
  bumpQueuedLead,
  expireOldQueuedLeads,
  type QueuedLead,
} from "../../config/db.js";
import { findKnownSender, upsertKnownSender, deleteKnownSenderByItemId } from "../../lib/dedup.js";
import { upsertPendingClarification } from "../../lib/conversation.js";
import {
  createLeadRow,
  updateLastIgMessage,
  updateItemPhone,
  getItemBoardAndGroup,
  findLeadByPhone,
} from "./monday.service.js";
import { findLeadOnActiveServiceBoards } from "./monday.webhook.service.js";
import { MondayRateLimitError } from "./monday.client.js";
import { submitWebsiteLeadToMonday } from "../website/website.service.js";
import type { WebsiteLead } from "../website/website.validator.js";
import type { N8nLeadFallback } from "./monday.validator.js";

const BATCH_SIZE = 5;

function parseWebsitePayload(payload: string | null): WebsiteLead | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as WebsiteLead;
  } catch {
    return null;
  }
}

async function drainWebsiteRow(row: QueuedLead): Promise<void> {
  const input = parseWebsitePayload(row.payload);

  if (!input) {
    // Missing or corrupt payload can never be replayed — bumping it would just
    // churn for 7 days before expiring anyway, so resolve it immediately.
    logger.error(
      {
        id: row.id,
        senderId: row.sender_id,
        phone: row.phone,
        service: row.service,
        payload: row.payload,
      },
      "monday_lead_queue: website row payload missing/corrupt — unrecoverable, dropping",
    );
    deleteQueuedLead(row.id);
    return;
  }

  await submitWebsiteLeadToMonday(input);
}

function parseN8nPayload(payload: string | null): N8nLeadFallback | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as N8nLeadFallback;
  } catch {
    return null;
  }
}

async function drainN8nRow(row: QueuedLead): Promise<void> {
  const input = parseN8nPayload(row.payload);

  if (!input) {
    // Same reasoning as the website poison-row guard — a missing/corrupt
    // payload can never be replayed, so resolve it now instead of churning
    // for 7 days before expiring anyway.
    logger.error(
      {
        id: row.id,
        senderId: row.sender_id,
        phone: row.phone,
        payload: row.payload,
      },
      "monday_lead_queue: n8n row payload missing/corrupt — unrecoverable, dropping",
    );
    deleteQueuedLead(row.id);
    return;
  }

  // Dedup on the CRM board — the lead may have arrived meanwhile via IG DM or
  // website, or this could be a duplicate fallback POST from n8n's own retry.
  // No phone means email-only; skip dedup and accept the tiny dup risk.
  if (input.phone972) {
    const existing = await findLeadByPhone(input.phone972);
    if (existing) {
      logger.info(
        { id: row.id, phone: input.phone972, itemId: existing.itemId },
        "monday_lead_queue: n8n fallback lead already exists in CRM by phone — dropping without create",
      );
      return;
    }
  }

  const { itemId } = await createLeadRow({
    name: input.full_name,
    phone: input.phone972 ?? null,
    service: "uman",
    source: "n8n",
    email: input.email ?? undefined,
    inquiryDate: input.inquiryDate,
    sourceLabel: env.MONDAY_SOURCE_LABEL_PAID,
  });

  // NO welcome call here — Monday's create_item lead-ready webhook fires
  // maybeSendUmanWelcome once this row lands (uman + phone), identical to the
  // direct-n8n path. Firing it here too would double-send.
  logger.info(
    { id: row.id, itemId, phone: input.phone972 },
    "monday_lead_queue: n8n fallback lead created",
  );
}

async function drainIgRow(row: QueuedLead): Promise<void> {
  const known = findKnownSender(row.platform, row.sender_id);

  if (known) {
    // Liveness check — let a MondayRateLimitError here propagate so the row
    // bumps and retries; only a resolved (non-throwing) check may treat this
    // sender as already-created.
    const live = await getItemBoardAndGroup(known.monday_item_id);

    if (live) {
      try {
        await updateLastIgMessage(known.monday_item_id, row.message_text);
      } catch (err) {
        if (err instanceof MondayRateLimitError) throw err;
        logger.warn(
          { err, itemId: known.monday_item_id },
          "monday_lead_queue: best-effort updateLastIgMessage failed (row already exists)",
        );
      }

      if (row.phone) {
        try {
          await updateItemPhone(known.monday_item_id, row.phone);
        } catch (err) {
          if (err instanceof MondayRateLimitError) throw err;
          logger.warn(
            { err, itemId: known.monday_item_id },
            "monday_lead_queue: best-effort updateItemPhone failed (row already exists)",
          );
        }
      }

      return;
    }

    // Stale mapping (item deleted/archived/off-board) — mirror meta.service's
    // self-heal: drop it and fall through to the create path below, exactly as
    // if this sender were brand new.
    deleteKnownSenderByItemId(known.monday_item_id);
    logger.warn(
      { senderId: row.sender_id, mondayItemId: known.monday_item_id },
      "monday_lead_queue: stale known_senders mapping — treating sender as new",
    );
  }

  // Paid board dedup — the lead may have been closed onto a service board
  // during a long outage; a duplicate CRM row is worse than a couple of gql
  // calls on this low-volume retry path.
  if (row.service !== null) {
    const searchName = row.sender_username ?? null;
    const phones = row.phone ? [row.phone] : [];
    const hit = await findLeadOnActiveServiceBoards(row.service, phones, searchName);
    if (hit) {
      logger.info(
        { senderId: row.sender_id, boardId: hit.boardId, serviceItemId: hit.itemId, service: row.service },
        "monday_lead_queue: lead already on active service board — dropping without create",
      );
      return;
    }
  }

  const { itemId } = await createLeadRow({
    name: row.display_name,
    phone: row.phone,
    service: row.service,
    source: "instagram",
  });

  upsertKnownSender({
    platform: row.platform,
    senderId: row.sender_id,
    senderUsername: row.sender_username ?? undefined,
    mondayItemId: itemId,
    phone: row.phone,
  });

  // Entry B — a vague lead's clarification is deferred here (it needs a
  // mondayItemId). The WA welcome is NOT fired here — Monday's own create_item
  // lead-ready webhook fires it once this create lands, under the itemId
  // dedup key; firing it again here would double-send.
  if (row.open_clarification && row.service === null) {
    upsertPendingClarification({
      platform: row.platform,
      senderId: row.sender_id,
      mondayItemId: itemId,
      phone: row.phone,
    });
  }

  try {
    await updateLastIgMessage(itemId, row.message_text);
  } catch (err) {
    logger.warn({ err, itemId }, "monday_lead_queue: best-effort updateLastIgMessage failed");
  }

  logger.info(
    { id: row.id, senderId: row.sender_id, itemId, service: row.service },
    "monday_lead_queue: drained — lead created",
  );
}

let draining = false;

/**
 * Cron-driven drain (every minute). Retries leads that failed Monday creation
 * on a 429, redoing dedup/create/known-sender/clarification from scratch —
 * this table stores the business intent, not a raw gql payload. A daily-limit
 * error breaks the whole batch (every other row would fail identically);
 * anything else bumps just that row with exponential backoff.
 */
export async function drainMondayLeadQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (const row of expireOldQueuedLeads()) {
      logger.error(
        {
          id: row.id,
          senderId: row.sender_id,
          senderUsername: row.sender_username,
          phone: row.phone,
          service: row.service,
          displayName: row.display_name,
        },
        "monday_lead_queue: lead permanently abandoned after 7 days — manual recovery needed",
      );
    }

    const batch = getDueQueuedLeads(BATCH_SIZE);

    for (const row of batch) {
      try {
        if (row.platform === "website") {
          await drainWebsiteRow(row);
        } else if (row.platform === "n8n") {
          await drainN8nRow(row);
        } else {
          await drainIgRow(row);
        }
        deleteQueuedLead(row.id);
      } catch (err) {
        if (err instanceof MondayRateLimitError && err.kind === "daily") {
          bumpQueuedLead(row.id, err.message, err.retryInSeconds + 60);
          logger.warn(
            { id: row.id, retryInSeconds: err.retryInSeconds },
            "monday_lead_queue: daily limit hit mid-drain — bumped and breaking batch",
          );
          break;
        }

        const message = err instanceof Error ? err.message : String(err);
        const delaySeconds = Math.min(60 * 2 ** row.attempt_count, 3600);
        bumpQueuedLead(row.id, message, delaySeconds);
        logger.warn(
          { id: row.id, err, delaySeconds },
          "monday_lead_queue: drain attempt failed — bumped for retry",
        );
      }
    }
  } finally {
    draining = false;
  }
}
