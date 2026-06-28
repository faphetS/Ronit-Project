import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import {
  isMessageProcessed,
  markMessageProcessed,
  findKnownSender,
  upsertKnownSender,
  deleteKnownSenderByItemId,
} from "../../lib/dedup.js";
import {
  enqueueComment,
  isCommentQueued,
  getQueuedComments,
  deleteQueuedComment,
  bumpQueuedComment,
  countCommentDmsSentLastHour,
  expireOldQueuedComments,
} from "../../config/db.js";
import {
  createLeadRow,
  updateLastIgMessage,
  getItemBoardAndGroup,
} from "../monday/monday.service.js";
import { sendCommentPrivateReply } from "./meta.outbound.service.js";

const DEDUP_SOURCE = "ig_comment";

// Only Uman for now: the post CTA is "הגיבי אומן". Challah is deferred.
const UMAN_KEYWORD = /אומן/;

// Max comment DMs drained per cron tick. The hourly cap is the real governor;
// this just stops a single tick from emptying a large backlog in one burst.
const DRAIN_PER_TICK = 5;

export interface IncomingComment {
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterUsername?: string;
  mediaId?: string;
  // entry.id of the webhook = the post-owning (business) account, in the SAME
  // id-scope as commenterId → the reliable "this is our own comment" check.
  recipientId?: string;
}

/**
 * Ingest a new Instagram post comment. Master-gated OFF by default
 * (IG_COMMENT_HANDLER_ENABLED). A comment containing "אומן" from a real user is
 * PARKED in the queue after cheap guards; the meta cron drains the queue at
 * <= IG_COMMENT_REPLY_MAX_PER_HOUR/hour and does the actual DM + Monday-lead
 * creation (see processQueuedComment). Routing every send through the paced
 * drainer means a viral post can never blast DMs and no lead is ever lost.
 *
 * Forward-only by construction: it reacts solely to live webhook events (no
 * historical backfill) and dedupes on comment_id, so the existing pre-subscription
 * comments are never touched and no comment is handled twice.
 */
export async function handleIncomingComment(input: IncomingComment): Promise<void> {
  if (!env.IG_COMMENT_HANDLER_ENABLED) return;

  const { commentId, commentText, commenterId } = input;

  if (isMessageProcessed(DEDUP_SOURCE, commentId)) return; // already DMed
  if (isCommentQueued(commentId)) return; // already waiting in the queue

  // Never act on the business account's own comments. entry.id (recipientId) is
  // the reliable same-scope signal; the configured account id is a backup.
  if (
    (input.recipientId && commenterId === input.recipientId) ||
    (env.IG_PROFESSIONAL_ACCOUNT_ID && commenterId === env.IG_PROFESSIONAL_ACCOUNT_ID)
  ) {
    return;
  }

  // Keyword gate — only "אומן" for now.
  if (!UMAN_KEYWORD.test(commentText)) return;

  enqueueComment({
    commentId,
    commenterId,
    commenterUsername: input.commenterUsername,
    recipientId: input.recipientId,
    commentText,
  });
  logger.info({ commentId, commenterId }, "IG comment 'אומן' queued for paced DM");
}

type ProcessResult = "sent" | "skipped" | "failed";

/**
 * Do the actual work for one queued comment: DM FIRST, then — only on a confirmed
 * send — create the Uman lead + register the commenter (so a later phone via DM
 * reply or form submit lands on the same row). Returns:
 *  - "sent"    DM delivered (row created, or row failed-but-logged) → drop from queue
 *  - "skipped" commenter already a live lead → no DM/row needed → drop from queue
 *  - "failed"  DM not sent → keep in queue and retry on the next tick
 */
async function processQueuedComment(input: {
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterUsername?: string;
}): Promise<ProcessResult> {
  const { commentId, commentText, commenterId, commenterUsername } = input;

  // Duplicate-lead guard: already a live CRM lead → no dup row / no re-DM. A stale
  // mapping (item deleted/archived) is cleaned up and the commenter treated as new.
  const known = findKnownSender("instagram", commenterId);
  if (known) {
    const live = await getItemBoardAndGroup(known.monday_item_id);
    if (live) {
      logger.info(
        { commentId, commenterId, itemId: known.monday_item_id },
        "IG comment from existing lead — skipping (already in funnel)",
      );
      return "skipped";
    }
    deleteKnownSenderByItemId(known.monday_item_id);
  }

  // ① Send the Private-Reply DM FIRST. No Monday row unless this is a confirmed send.
  const sent = await sendCommentPrivateReply(commentId, commenterId);
  if (!sent) return "failed";

  // ② Mark sent — drives the hourly counter + dedup (a redelivered webhook won't re-DM).
  markMessageProcessed(DEDUP_SOURCE, commentId);

  // ③ Create the Uman lead (no phone yet → no-phone group). A failure here AFTER the
  //    DM is logged for manual recovery — one orphan DM beats a double DM, so we
  //    still treat the item as done ("sent") and drop it from the queue.
  let itemId: string;
  try {
    const created = await createLeadRow({
      name: commenterUsername ?? "IG commenter",
      phone: null,
      service: "uman",
      source: "instagram",
    });
    itemId = created.itemId;
  } catch (err) {
    logger.error(
      { err, commentId, commenterId, commenterUsername },
      "IG comment DM sent but Monday row creation failed — manual recovery needed",
    );
    return "sent";
  }

  // ④ Register the commenter so a later phone (DM reply or form submit) updates THIS row.
  upsertKnownSender({
    platform: "instagram",
    senderId: commenterId,
    senderUsername: commenterUsername,
    mondayItemId: itemId,
    phone: null,
  });

  // ⑤ Record the comment text for context — best-effort (lead already exists).
  try {
    await updateLastIgMessage(itemId, commentText);
  } catch (err) {
    logger.warn({ err, itemId }, "IG comment: updateLastIgMessage failed (non-fatal)");
  }

  logger.info(
    { commentId, commenterId, commenterUsername, itemId },
    "IG comment 'אומן' → DM sent + Uman lead created",
  );
  return "sent";
}

let draining = false;

/**
 * Cron-driven drain (every minute). Sends up to (cap − sent-in-last-hour) queued
 * comment DMs, never more than DRAIN_PER_TICK in a single tick — so a burst can
 * never blast and nothing is lost (overflow simply waits for the next tick). The
 * hourly counter is read off the `ig_comment` send marks. Gated off with the handler.
 */
export async function drainCommentQueue(): Promise<void> {
  if (!env.IG_COMMENT_HANDLER_ENABLED) return;
  if (draining) return;
  draining = true;
  try {
    for (const cid of expireOldQueuedComments()) {
      logger.warn(
        { commentId: cid },
        "Queued IG comment expired (>6d, past the private-reply window) — dropped",
      );
    }

    const cap = env.IG_COMMENT_REPLY_MAX_PER_HOUR;
    const remaining = cap > 0 ? cap - countCommentDmsSentLastHour() : DRAIN_PER_TICK;
    if (remaining <= 0) return;

    const batch = getQueuedComments(Math.min(remaining, DRAIN_PER_TICK));
    if (batch.length === 0) return;

    for (const item of batch) {
      if (cap > 0 && countCommentDmsSentLastHour() >= cap) break; // re-check as we send
      if (isMessageProcessed(DEDUP_SOURCE, item.comment_id)) {
        deleteQueuedComment(item.id); // already handled elsewhere
        continue;
      }
      const result = await processQueuedComment({
        commentId: item.comment_id,
        commentText: item.comment_text,
        commenterId: item.commenter_id,
        commenterUsername: item.commenter_username ?? undefined,
      });
      if (result === "failed") {
        bumpQueuedComment(item.id, "Private-Reply DM not sent");
      } else {
        deleteQueuedComment(item.id);
      }
    }
  } finally {
    draining = false;
  }
}
