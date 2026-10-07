import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { detectTripTrigger, type Trip } from "../../lib/trip.js";
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
  enqueueMondayLead,
  markOwedCommentFlyer,
  getOwedCommentTrips,
  type QueuedComment,
} from "../../config/db.js";
import {
  createLeadRow,
  updateLastIgMessage,
  getItemBoardAndGroup,
} from "../monday/monday.service.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import {
  sendCommentPrivateReply,
  postCommentReply,
  type PrivateReplyOutcome,
} from "./meta.outbound.service.js";
import { recordTripCommentLead } from "./meta.service.js";

const DEDUP_SOURCE = "ig_comment";
const KNIFE_DM_SOURCE = "ig_knife_recipient";

// Only Uman for now: the post CTA is "הגיבי אומן". Challah is deferred.
const UMAN_KEYWORD = /אומן/;

// The knife-sale keyword only fires on the one dedicated reel (IG_COMMENT_KNIFE_MEDIA_ID) —
// unlike UMAN_KEYWORD, which fires on any post.
const KNIFE_KEYWORD = /פרנסה/;

// Max comment DMs drained per cron tick. The hourly cap is the real governor;
// this just stops a single tick from emptying a large backlog in one burst.
const DRAIN_PER_TICK = 5;

// A failing item is retried with exponential backoff, so a handful of permanently failing
// rows can no longer monopolise the head of the queue. Transient failures (network, 5xx)
// get 8 tries; an unrecognised 4xx gets 5, since retrying a refusal rarely changes the answer.
const MAX_ATTEMPTS_TRANSIENT = 8;
const MAX_ATTEMPTS_REJECTED = 5;
const BACKOFF_BASE_SECONDS = 60;
const BACKOFF_CAP_SECONDS = 3600;

// Account-wide trouble is not the item's fault, so it pauses the whole drain rather than
// burning attempts on every queued comment.
const MINUTE_MS = 60_000;
const PAUSE_MS = {
  "rate-limited": 60 * MINUTE_MS,
  token: 15 * MINUTE_MS,
  "action-blocked": 24 * 60 * MINUTE_MS,
} as const;

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
 * (IG_COMMENT_HANDLER_ENABLED). A comment that qualifies — "פרנסה" on the knife reel,
 * a bare trip word (חנוכה / כסלו …) on any post, or "אומן" on any post — is PARKED in the
 * queue after cheap guards; the meta cron drains the queue at
 * <= IG_COMMENT_REPLY_MAX_PER_HOUR/hour and does the actual DM + Monday-lead
 * creation (see processQueuedComment). Routing every send through the paced
 * drainer means a viral post can never blast DMs and no lead is ever lost.
 *
 * Forward-only by construction: it reacts solely to live webhook events and dedupes on
 * comment_id, so comments from before the subscription are never touched here (the
 * one-off backfill command enqueues those on purpose) and none is handled twice.
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

  // Keyword gate, in order — "פרנסה" on the knife media wins (even if the text also
  // mentions "אומן"), then a bare trip word on any post, then "אומן" on any post.
  const isKnifeComment =
    !!env.IG_COMMENT_KNIFE_MEDIA_ID &&
    input.mediaId === env.IG_COMMENT_KNIFE_MEDIA_ID &&
    KNIFE_KEYWORD.test(commentText);

  if (isKnifeComment) {
    enqueueComment({
      commentId,
      commenterId,
      commenterUsername: input.commenterUsername,
      recipientId: input.recipientId,
      commentText,
      kind: "knife",
    });
    logger.info({ commentId, commenterId }, "IG comment 'פרנסה' queued for paced DM (knife sale)");
    return;
  }

  // The trip is not stored: the drain re-derives it from the text.
  const trip = detectTripTrigger(commentText);
  if (trip !== null) {
    if (!env.IG_COMMENT_TRIP_ENABLED) return;
    enqueueComment({
      commentId,
      commenterId,
      commenterUsername: input.commenterUsername,
      recipientId: input.recipientId,
      commentText,
      kind: "trip",
    });
    logger.info({ commentId, commenterId, trip }, "IG comment trip word queued for paced DM");
    return;
  }

  if (!UMAN_KEYWORD.test(commentText)) return;
  if (!env.IG_COMMENT_UMAN_ENABLED) return;

  enqueueComment({
    commentId,
    commenterId,
    commenterUsername: input.commenterUsername,
    recipientId: input.recipientId,
    commentText,
    kind: "uman",
  });
  logger.info({ commentId, commenterId }, "IG comment 'אומן' queued for paced DM");
}

interface QueuedInput {
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterUsername?: string;
  kind: QueuedComment["kind"];
  attemptCount: number;
}

/**
 * What the drain does with a queue row once it has been worked on:
 *  - done   handled (sent, skipped or dropped for good) → remove it from the queue.
 *  - retry  not sent; keep it, backing off, until `maxAttempts` is spent.
 *  - pause  account-wide trouble: stop draining for `ms`; `bump` also counts this row's try.
 */
type ProcessResult =
  | { type: "done" }
  | { type: "retry"; reason: string; maxAttempts: number }
  | { type: "pause"; reason: string; ms: number; bump: boolean };

const DONE: ProcessResult = { type: "done" };

// Public replies are best-effort and never retried; postCommentReply logs its own failures.
// The catch is belt and braces: nothing about a public reply may bump a row whose DM is out
// or skip the bookkeeping that follows it.
async function postPublicReply(commentId: string, text: string): Promise<void> {
  try {
    await postCommentReply(commentId, text);
  } catch (err) {
    logger.warn({ err, commentId }, "IG comment public reply threw — ignored (best-effort)");
  }
}

/**
 * Turn a Private-Reply outcome that is NOT a send into the next step for the queue row.
 */
async function settleUnsent(
  input: QueuedInput,
  outcome: Exclude<PrivateReplyOutcome, "sent">,
): Promise<ProcessResult> {
  const { commentId, commenterId, kind, attemptCount } = input;

  switch (outcome) {
    case "blocked":
    case "maybe-blocked": {
      // Subcode 2534025 (maybe-blocked) may also be what Meta answers when an EARLIER attempt
      // of this same send already landed (we saw a timeout, it went through). Telling her
      // publicly that she cannot be messaged would then be wrong, so it only counts as
      // blocked on a first attempt. 551 is unambiguous.
      const blocked = outcome === "blocked" || attemptCount === 0;
      if (blocked && kind === "trip" && env.IG_COMMENT_BLOCKED_REPLY_ENABLED) {
        await postPublicReply(commentId, env.IG_MSG_COMMENT_REPLY_BLOCKED);
      }
      markMessageProcessed(DEDUP_SOURCE, commentId);
      logger.warn(
        { commentId, commenterId, kind, outcome, attemptCount },
        blocked
          ? "IG comment Private-Reply blocked by the commenter's settings — dropped"
          : "IG comment Private-Reply reported blocked on a retry — dropped silently (an earlier attempt may have landed)",
      );
      return DONE;
    }

    case "drop":
      markMessageProcessed(DEDUP_SOURCE, commentId);
      logger.warn(
        { commentId, commenterId, kind, attemptCount },
        "IG comment Private-Reply permanently impossible for this comment — dropped silently",
      );
      return DONE;

    case "dry-run":
      logger.info(
        { commentId, commenterId, kind },
        "IG comment drain: dry-run outcome — dropped without marking (nothing was sent)",
      );
      return DONE;

    case "transient":
      return {
        type: "retry",
        reason: "Private-Reply DM not sent (transient failure)",
        maxAttempts: MAX_ATTEMPTS_TRANSIENT,
      };

    case "rejected":
      return {
        type: "retry",
        reason: "Private-Reply DM refused with an unrecognised 4xx",
        maxAttempts: MAX_ATTEMPTS_REJECTED,
      };

    case "rate-limited":
      return { type: "pause", reason: "rate limited by Meta", ms: PAUSE_MS["rate-limited"], bump: false };

    case "token":
      return { type: "pause", reason: "IG token unavailable or invalid", ms: PAUSE_MS.token, bump: false };

    case "action-blocked":
      return {
        type: "pause",
        reason: "Meta blocked the action on the account (code 368)",
        ms: PAUSE_MS["action-blocked"],
        bump: true,
      };
  }
}

/**
 * After a trip comment's DM is OUT. The Monday row is bookkeeping around a DM that already
 * landed, so it can never un-send it: on any failure the lead is parked in monday_lead_queue
 * (its drain is idempotent — it checks known_senders first) instead of being lost.
 */
async function recordTripLead(input: {
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterUsername?: string;
  trip: Trip;
}): Promise<void> {
  const { commentId, commentText, commenterId, commenterUsername, trip } = input;
  try {
    await recordTripCommentLead({
      senderId: commenterId,
      senderUsername: commenterUsername,
      commentText,
      trip,
    });
  } catch (err) {
    logger.error(
      { err, commentId, commenterId, commenterUsername },
      "IG trip comment DM sent but lead bookkeeping failed — deferred to monday_lead_queue",
    );
    enqueueMondayLead({
      platform: "instagram",
      senderId: commenterId,
      senderUsername: commenterUsername,
      displayName: commenterUsername ?? "IG commenter",
      phone: null,
      service: "uman",
      messageText: commentText,
      source: "instagram",
      openClarification: false,
    });
  }
}

/**
 * A bare trip word. Private reply FIRST (the only DM a commenter can get), then — only on
 * a confirmed send — her lead. Everything after the send is best-effort and can never turn
 * the row into a retry: marks, then the public acknowledgement, then Monday, so a slow or
 * rate-limited Monday cannot delay or skip the reply she can see under her comment.
 */
async function processTripComment(input: QueuedInput): Promise<ProcessResult> {
  const { commentId, commentText, commenterId, commenterUsername } = input;

  if (!env.IG_COMMENT_TRIP_ENABLED) {
    logger.info(
      { commentId, commenterId },
      "Trip comment flow disabled — dropping queued comment without DM",
    );
    return DONE;
  }

  const trip = detectTripTrigger(commentText);
  if (trip === null) {
    logger.warn(
      { commentId, commenterId, commentText },
      "Queued trip comment is no longer a trip word — dropped without DM",
    );
    return DONE;
  }

  // She already got this trip's DM from an earlier comment (the owed-flyer mark is its
  // receipt, kept for the 7-day private-reply window). Every comment may legally get its own
  // private reply, but a second identical ask would just be noise — acknowledge publicly only.
  if (getOwedCommentTrips(commenterId).includes(trip)) {
    await postPublicReply(commentId, env.IG_MSG_COMMENT_REPLY_SENT);
    markMessageProcessed(DEDUP_SOURCE, commentId);
    logger.info(
      { commentId, commenterId, trip },
      "IG trip comment from someone already DMed about this trip — public reply only",
    );
    return DONE;
  }

  const outcome = await sendCommentPrivateReply(commentId, commenterId, "trip", trip);
  if (outcome !== "sent") return settleUnsent(input, outcome);

  markMessageProcessed(DEDUP_SOURCE, commentId); // drives the hourly counter + dedup
  markOwedCommentFlyer(commenterId, trip); // the flyer rides on her first reply
  await postPublicReply(commentId, env.IG_MSG_COMMENT_REPLY_SENT);
  await recordTripLead({ commentId, commentText, commenterId, commenterUsername, trip });

  logger.info(
    { commentId, commenterId, commenterUsername, trip },
    "IG trip comment → private reply sent + lead recorded",
  );
  return DONE;
}

/**
 * Do the actual work for one queued comment: DM FIRST, then — only on a confirmed
 * send — create the lead + register the commenter (so a later phone via DM
 * reply or form submit lands on the same row).
 */
async function processQueuedComment(input: QueuedInput): Promise<ProcessResult> {
  const { commentId, commentText, commenterId, commenterUsername, kind } = input;

  if (kind === "knife") {
    // No known-sender/Monday-liveness check by design — an existing CRM lead may
    // still want to buy a knife, so we always DM. No Monday row is ever created.
    const outcome = await sendCommentPrivateReply(commentId, commenterId, "knife");
    if (outcome !== "sent") return settleUnsent(input, outcome);

    markMessageProcessed(DEDUP_SOURCE, commentId);
    markMessageProcessed(KNIFE_DM_SOURCE, commenterId);

    logger.info(
      { commentId, commenterId, commenterUsername },
      "IG comment 'פרנסה' → knife DM sent (no Monday row by design)",
    );
    return DONE;
  }

  // Before the uman gate below: that flag is off in production, and a trip comment must not
  // be dropped by a switch that is about אומן comments.
  if (kind === "trip") return processTripComment(input);

  if (!env.IG_COMMENT_UMAN_ENABLED) {
    logger.info(
      { commentId, commenterId },
      "Uman comment flow disabled — dropping queued comment without DM",
    );
    return DONE;
  }

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
      return DONE;
    }
    deleteKnownSenderByItemId(known.monday_item_id);
  }

  // ① Send the Private-Reply DM FIRST. No Monday row unless this is a confirmed send.
  const outcome = await sendCommentPrivateReply(commentId, commenterId, "uman");
  if (outcome !== "sent") return settleUnsent(input, outcome);

  // ② Mark sent — drives the hourly counter + dedup (a redelivered webhook won't re-DM).
  markMessageProcessed(DEDUP_SOURCE, commentId);

  // ③ Create the Uman lead (no phone yet → no-phone group). A failure here AFTER
  //    the DM is deferred to monday_lead_queue — one orphan DM beats a double DM,
  //    so we still treat the item as done and drop it from this queue.
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
    if (err instanceof MondayRateLimitError) {
      enqueueMondayLead({
        platform: "instagram",
        senderId: commenterId,
        senderUsername: commenterUsername,
        displayName: commenterUsername ?? "IG commenter",
        phone: null,
        service: "uman",
        messageText: commentText,
        source: "instagram",
        openClarification: false,
      });
      logger.warn(
        { err, commentId, commenterId, commenterUsername },
        "IG comment DM sent but Monday row creation rate-limited — deferred to monday_lead_queue",
      );
      return DONE;
    }
    logger.error(
      { err, commentId, commenterId, commenterUsername },
      "IG comment DM sent but Monday row creation failed — manual recovery needed",
    );
    return DONE;
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
  return DONE;
}

let draining = false;
let pausedUntil = 0;

/** Test hook: forget an active pause. */
export function resetCommentDrainPause(): void {
  pausedUntil = 0;
}

function retryOrDrop(item: QueuedComment, reason: string, maxAttempts: number): void {
  if (item.attempt_count + 1 >= maxAttempts) {
    deleteQueuedComment(item.id);
    logger.warn(
      {
        commentId: item.comment_id,
        commenterId: item.commenter_id,
        commenterUsername: item.commenter_username,
        kind: item.kind,
        attempts: item.attempt_count + 1,
        lastError: reason,
      },
      "IG comment dropped after max attempts — the backfill command can re-enqueue it if it is still inside the 7-day window",
    );
    return;
  }
  const delaySeconds = Math.min(BACKOFF_BASE_SECONDS * 2 ** item.attempt_count, BACKOFF_CAP_SECONDS);
  bumpQueuedComment(item.id, reason, delaySeconds);
}

function settle(item: QueuedComment, result: ProcessResult): void {
  switch (result.type) {
    case "done":
      deleteQueuedComment(item.id);
      return;
    case "retry":
      retryOrDrop(item, result.reason, result.maxAttempts);
      return;
    case "pause":
      pausedUntil = Date.now() + result.ms;
      logger.warn(
        { commentId: item.comment_id, reason: result.reason, pausedMinutes: result.ms / MINUTE_MS },
        "IG comment drain paused",
      );
      if (result.bump) retryOrDrop(item, result.reason, MAX_ATTEMPTS_TRANSIENT);
      return;
  }
}

/**
 * Cron-driven drain (every minute). Sends up to (cap − sent-in-last-hour) queued
 * comment DMs, never more than DRAIN_PER_TICK in a single tick — so a burst can
 * never blast and nothing is lost (overflow simply waits for the next tick). The
 * hourly counter is read off the `ig_comment` send marks. Gated off with the handler,
 * and idle while paused (rate limit / token trouble / action block).
 */
export async function drainCommentQueue(): Promise<void> {
  if (!env.IG_COMMENT_HANDLER_ENABLED) return;
  if (Date.now() < pausedUntil) return;
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
      if (Date.now() < pausedUntil) break; // an earlier item in this batch paused the drain
      if (cap > 0 && countCommentDmsSentLastHour() >= cap) break; // re-check as we send
      if (isMessageProcessed(DEDUP_SOURCE, item.comment_id)) {
        deleteQueuedComment(item.id); // already handled elsewhere
        continue;
      }
      try {
        const result = await processQueuedComment({
          commentId: item.comment_id,
          commentText: item.comment_text,
          commenterId: item.commenter_id,
          commenterUsername: item.commenter_username ?? undefined,
          kind: item.kind,
          attemptCount: item.attempt_count,
        });
        settle(item, result);
      } catch (err) {
        // A Monday error escaping here (e.g. getItemBoardAndGroup) must not abort
        // the whole drain tick — back this item off and keep draining the rest.
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ err, commentId: item.comment_id }, "IG comment drain — unexpected error, backed off for retry");
        retryOrDrop(item, message, MAX_ATTEMPTS_TRANSIENT);
      }
    }
  } finally {
    draining = false;
  }
}
