import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { markLeadReplied } from "../../config/db.js";
import { isMessageProcessed, markMessageProcessed } from "../../lib/dedup.js";
import { classifyNegativeIntent } from "../../lib/negative-intent.js";
import {
  findLeadByPhone,
  getItemBoardAndGroup,
  moveItemToGroup,
} from "../monday/monday.service.js";
import { toMsisdn } from "./whatsapp.gateway.js";
import { isAllowed } from "./uman-welcome.service.js";

const DEDUP_SOURCE = "wa_inbound";

// Synchronous double-fire guard: two concurrent deliveries of the same message
// could both pass the dedup check before either marks. Added/removed around the
// awaited work so the second is dropped within this single Node process.
const inFlight = new Set<string>();

/** Private incoming WhatsApp payload (the only shape we act on — group/outgoing
 *  events are filtered out in the controller). */
export interface InboundWhatsApp {
  from?: string;
  message?: string;
  pushName?: string;
  timestamp?: number;
}

// The gateway payload has no message id, so we dedup on (from + timestamp +
// message hash). The hash keeps two DIFFERENT messages sent in the same epoch
// second from colliding (which would silently drop the second — e.g. an opt-out
// right after a neutral line), and stops a missing timestamp collapsing all of a
// sender's messages onto one key.
function dedupKey(from: string, timestamp: number | undefined, message: string): string {
  const h = createHash("sha1").update(message).digest("hex").slice(0, 16);
  return `${from}:${timestamp ?? ""}:${h}`;
}

/**
 * Handle one inbound WhatsApp message from a lead:
 *   1. dedup on (from + timestamp + message hash);
 *   2. match the sender's phone to a CRM lead (no match → ignore);
 *   3. mark the lead replied → HALTS the follow-up funnel (engaged → manual);
 *   4. if the message reads as a clear opt-out AND the lead is in the Uman
 *      follow-up group, move them to the not-relevant group.
 *
 * The processed-mark is written ONLY after the work completes without throwing,
 * so a transient Monday failure leaves the message un-marked (re-processable)
 * rather than silently swallowing an opt-out. Non-throwing to the caller.
 */
export async function handleInboundWhatsApp(body: InboundWhatsApp): Promise<void> {
  const from = body.from?.trim();
  if (!from) return;

  const externalId = dedupKey(from, body.timestamp, body.message ?? "");
  if (inFlight.has(externalId)) return;
  if (isMessageProcessed(DEDUP_SOURCE, externalId)) {
    logger.info({ from }, "WhatsApp inbound already processed — skipping");
    return;
  }
  inFlight.add(externalId);

  try {
    await processInbound(from, body);
    markMessageProcessed(DEDUP_SOURCE, externalId);
  } catch (err) {
    logger.error(
      { err, from },
      "WhatsApp inbound processing failed — not marking (re-processable on retry)",
    );
  } finally {
    inFlight.delete(externalId);
  }
}

async function processInbound(from: string, body: InboundWhatsApp): Promise<void> {
  const msisdn = toMsisdn(from);

  // Gate inbound processing by the SAME allowlist that gates outbound sends. During
  // the staged rollout (allowlist = a few test numbers) this keeps the reply-halt and
  // the not-relevant move from acting on real leads — so the whole feature is governed
  // by one switch, not split (outbound gated, inbound silently live).
  if (!isAllowed(msisdn)) {
    logger.info({ from }, "WhatsApp inbound — sender not allowlisted, skipping");
    return;
  }

  const lead = await findLeadByPhone(msisdn);
  if (!lead) {
    logger.info({ from, msisdn }, "WhatsApp inbound — no CRM lead matched, ignoring");
    return;
  }

  // ANY reply from a matched lead halts the follow-up funnel — they're engaged now.
  markLeadReplied(lead.itemId, msisdn);

  const text = (body.message ?? "").trim();
  if (!text) {
    logger.info({ itemId: lead.itemId }, "WhatsApp inbound — empty/non-text, funnel halted only");
    return;
  }

  const verdict = await classifyNegativeIntent(text);
  if (!verdict.notInterested) {
    logger.info(
      { itemId: lead.itemId, via: verdict.via },
      "WhatsApp inbound — still interested, activity recorded",
    );
    return;
  }

  // Negative-intent routing is scoped to the one group this feature owns: the
  // Uman follow-up group. A lead anywhere else (new-leads, no-phone, closed,
  // already not-relevant, challah, or merely sharing a phone) is left in place.
  const loc = await getItemBoardAndGroup(lead.itemId);
  if (!loc) {
    logger.warn(
      { itemId: lead.itemId },
      "WhatsApp negative intent but item is not active — skipping move",
    );
    return;
  }
  if (loc.groupId !== env.MONDAY_GROUP_UMAN_FOLLOWUP_ID) {
    logger.info(
      { itemId: lead.itemId, groupId: loc.groupId },
      "WhatsApp negative intent but lead not in Uman follow-up group — no move",
    );
    return;
  }

  await moveItemToGroup(lead.itemId, env.MONDAY_GROUP_NOT_RELEVANT_ID);
  logger.info(
    { itemId: lead.itemId, from, via: verdict.via, confidence: verdict.confidence },
    "WhatsApp negative intent — lead moved to not-relevant",
  );
}
