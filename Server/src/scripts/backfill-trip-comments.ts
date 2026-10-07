/**
 * One-off backfill: enqueue the trip-word comments (חנוכה / כסלו …) on one post that the bot
 * never answered because the trip comment flow did not exist yet.
 *
 *   node dist/scripts/backfill-trip-comments.js --media <id> [--apply] [--limit N] [--max-age-hours 140]
 *
 * Dry run by default: it decides about every comment and logs why, and enqueues nothing
 * until --apply. Enqueued rows are sent by the normal paced drain (kind "trip"), which
 * needs IG_COMMENT_HANDLER_ENABLED and IG_COMMENT_TRIP_ENABLED on, exactly like live ones.
 *
 * Lives in src/ because only src/ is compiled into the Docker image. It must not import
 * server.ts or anything that starts a cron or a listener.
 */
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { logger } from "../config/logger.js";
import { enqueueComment, isCommentQueued } from "../config/db.js";
import { isMessageProcessed } from "../lib/dedup.js";
import { AppError, ValidationError } from "../lib/errors.js";
import { detectTripTrigger, type Trip } from "../lib/trip.js";
import { getCurrentIgToken } from "../domains/meta/meta.token.service.js";

const GRAPH = "https://graph.instagram.com/v23.0";
const HOUR_MS = 3_600_000;

// Meta allows a private reply for 7 days (168h), but the queue drops rows older than 144h
// (created_at = the real comment time), so the default stays inside that with a 4h margin.
export const DEFAULT_MAX_AGE_HOURS = 140;

// expireOldQueuedComments drops queue rows older than 6 days, counted from created_at —
// and a backfilled row keeps its REAL comment time as created_at.
const QUEUE_EXPIRY_HOURS = 144;

export interface IgCommentNode {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  parent_id?: string;
  from?: { id?: string; username?: string };
}

export interface BusinessAccount {
  id: string;
  username: string;
}

export interface ConversationMessage {
  id?: string;
  created_time?: string;
  from?: { id?: string; username?: string };
}

export type SkipReason =
  | "reply"
  | "own-comment"
  | "no-trigger"
  | "bad-timestamp"
  | "too-old"
  | "no-commenter-id"
  | "already-processed"
  | "already-queued"
  | "ronit-replied"
  | "contacted"
  | "conversation-check-failed";

export interface BackfillCandidate {
  commentId: string;
  commenterId: string;
  commenterUsername?: string;
  text: string;
  trip: Trip;
  commentMs: number;
  createdAt: string;
}

export type CommentDecision =
  | { comment: IgCommentNode; outcome: "candidate"; candidate: BackfillCandidate }
  | { comment: IgCommentNode; outcome: "skip"; reason: SkipReason };

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

// Graph writes 2026-10-05T19:45:52+0000 (no colon in the offset); Z and +00:00 are accepted too.
const IG_TIMESTAMP =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?<zone>Z|[+-]\d{2}:?\d{2})$/;

export function igTimestampToMs(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const parts = IG_TIMESTAMP.exec(timestamp)?.groups;
  if (!parts) return null;

  const { year, month, day, hour, minute, second, zone } = parts;
  const asIfUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  // Date.UTC quietly rolls impossible values over (month 13, hour 25) — refuse those.
  if (new Date(asIfUtc).toISOString().slice(0, 19) !== `${year}-${month}-${day}T${hour}:${minute}:${second}`) {
    return null;
  }

  const sign = zone.startsWith("-") ? -1 : 1;
  const offsetMinutes = zone === "Z" ? 0 : sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2)));
  return asIfUtc - offsetMinutes * 60_000;
}

/** Epoch ms → SQLite's UTC "YYYY-MM-DD HH:MM:SS". */
export function toSqliteTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export function igTimestampToSqlite(timestamp: string): string | null {
  const ms = igTimestampToMs(timestamp);
  return ms === null ? null : toSqliteTimestamp(ms);
}

// ---------------------------------------------------------------------------
// The candidate filter — pure
// ---------------------------------------------------------------------------

function isBusinessAuthor(comment: IgCommentNode, business: BusinessAccount): boolean {
  return (
    comment.from?.id === business.id ||
    comment.username === business.username ||
    comment.from?.username === business.username
  );
}

/** parent_id of every reply the business itself wrote = the comments Ronit already answered publicly. */
export function findRonitReplyParents(comments: IgCommentNode[], business: BusinessAccount): Set<string> {
  const parents = new Set<string>();
  for (const comment of comments) {
    if (comment.parent_id && isBusinessAuthor(comment, business)) parents.add(comment.parent_id);
  }
  return parents;
}

export interface EvaluateContext {
  business: BusinessAccount;
  nowMs: number;
  maxAgeMs: number;
  ronitRepliedTo: ReadonlySet<string>;
  isProcessed: (commentId: string) => boolean;
  isQueued: (commentId: string) => boolean;
}

/**
 * Every offline check, cheapest first; the first failing one is the reported reason. A
 * "candidate" still has one online check left (the conversation lookup, see planBackfill).
 */
export function evaluateComment(comment: IgCommentNode, ctx: EvaluateContext): CommentDecision {
  const skip = (reason: SkipReason): CommentDecision => ({ comment, outcome: "skip", reason });

  if (comment.parent_id) return skip("reply");
  if (isBusinessAuthor(comment, ctx.business)) return skip("own-comment");

  const trip = comment.text ? detectTripTrigger(comment.text) : null;
  if (trip === null || !comment.text) return skip("no-trigger");

  const commentMs = igTimestampToMs(comment.timestamp);
  if (commentMs === null) return skip("bad-timestamp");
  if (ctx.nowMs - commentMs >= ctx.maxAgeMs) return skip("too-old");

  const commenterId = comment.from?.id;
  if (!commenterId) return skip("no-commenter-id");

  if (ctx.isProcessed(comment.id)) return skip("already-processed");
  if (ctx.isQueued(comment.id)) return skip("already-queued");
  if (ctx.ronitRepliedTo.has(comment.id)) return skip("ronit-replied");

  return {
    comment,
    outcome: "candidate",
    candidate: {
      commentId: comment.id,
      commenterId,
      commenterUsername: comment.username ?? comment.from?.username,
      text: comment.text,
      trip,
      commentMs,
      createdAt: toSqliteTimestamp(commentMs),
    },
  };
}

/**
 * Has the business already written to this person since her comment? Any message newer than
 * the comment from someone other than the commenter counts. A message with no sender, or an
 * unreadable time, is judged the safe way round: no sender → contact, no time → ignored.
 */
export function hasBusinessMessageSince(
  messages: ConversationMessage[],
  commenterId: string,
  sinceMs: number,
): boolean {
  return messages.some((message) => {
    const at = igTimestampToMs(message.created_time);
    return at !== null && at >= sinceMs && message.from?.id !== commenterId;
  });
}

export async function planBackfill(input: {
  comments: IgCommentNode[];
  business: BusinessAccount;
  nowMs: number;
  maxAgeHours: number;
  isProcessed: (commentId: string) => boolean;
  isQueued: (commentId: string) => boolean;
  getConversationMessages: (userId: string) => Promise<ConversationMessage[]>;
}): Promise<CommentDecision[]> {
  const ctx: EvaluateContext = {
    business: input.business,
    nowMs: input.nowMs,
    maxAgeMs: input.maxAgeHours * HOUR_MS,
    ronitRepliedTo: findRonitReplyParents(input.comments, input.business),
    isProcessed: input.isProcessed,
    isQueued: input.isQueued,
  };

  const decisions: CommentDecision[] = [];
  for (const comment of input.comments) {
    const decision = evaluateComment(comment, ctx);
    if (decision.outcome !== "candidate") {
      decisions.push(decision);
      continue;
    }

    // One API call per real candidate, sequential — there are only ever a few hundred.
    const { commenterId, commentMs } = decision.candidate;
    try {
      const messages = await input.getConversationMessages(commenterId);
      decisions.push(
        hasBusinessMessageSince(messages, commenterId, commentMs)
          ? { comment, outcome: "skip", reason: "contacted" }
          : decision,
      );
    } catch (err) {
      // Fail closed: a message to someone we could not check is worse than one we skipped.
      logger.warn({ err, commentId: comment.id, commenterId }, "backfill: conversation lookup failed — not enqueuing");
      decisions.push({ comment, outcome: "skip", reason: "conversation-check-failed" });
    }
  }
  return decisions;
}

/** Candidates oldest-first (they are the closest to the 7-day window), capped at `limit`. */
export function selectForEnqueue(decisions: CommentDecision[], limit?: number): BackfillCandidate[] {
  const candidates = decisions
    .flatMap((decision) => (decision.outcome === "candidate" ? [decision.candidate] : []))
    .sort((a, b) => a.commentMs - b.commentMs);
  return limit === undefined ? candidates : candidates.slice(0, limit);
}

export function summarizeDecisions(decisions: CommentDecision[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const decision of decisions) {
    const key = decision.outcome === "candidate" ? "candidate" : decision.reason;
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Graph API — thin
// ---------------------------------------------------------------------------

async function graphGet(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    // The URL (it carries the token) is deliberately not part of the message.
    throw new AppError(
      502,
      `Instagram Graph request failed with ${res.status}: ${(await res.text()).slice(0, 500)}`,
      "IG_GRAPH_ERROR",
    );
  }
  return res.json();
}

function graphUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export async function fetchBusinessAccount(token: string): Promise<BusinessAccount> {
  const body = (await graphGet(graphUrl("me", { fields: "id,username", access_token: token }))) as {
    id?: unknown;
    username?: unknown;
  };
  if (typeof body.id !== "string" || typeof body.username !== "string") {
    throw new AppError(502, "Instagram /me did not return an id and a username", "IG_GRAPH_SHAPE");
  }
  return { id: body.id, username: body.username };
}

const isCommentNode = (value: unknown): value is IgCommentNode =>
  typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string";

export async function fetchAllComments(mediaId: string, token: string): Promise<IgCommentNode[]> {
  const comments: IgCommentNode[] = [];
  let next: string | undefined = graphUrl(`${encodeURIComponent(mediaId)}/comments`, {
    fields: "id,text,timestamp,username,parent_id,from",
    limit: "50",
    access_token: token,
  });

  while (next) {
    const page = (await graphGet(next)) as { data?: unknown; paging?: { next?: string } };
    if (Array.isArray(page.data)) comments.push(...page.data.filter(isCommentNode));
    next = page.paging?.next;
  }
  return comments;
}

export async function fetchConversationMessages(userId: string, token: string): Promise<ConversationMessage[]> {
  const body = (await graphGet(
    graphUrl("me/conversations", {
      platform: "instagram",
      user_id: userId,
      fields: "messages.limit(20){from,created_time}",
      access_token: token,
    }),
  )) as { data?: Array<{ messages?: { data?: ConversationMessage[] } }> };

  return (body.data ?? []).flatMap((conversation) => conversation.messages?.data ?? []);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface CliOptions {
  mediaId: string;
  apply: boolean;
  limit?: number;
  maxAgeHours: number;
}

function positiveNumber(flag: string, raw: string, integer: boolean): number {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new ValidationError(`${flag} must be a positive ${integer ? "integer" : "number"}, got "${raw}"`);
  }
  return value;
}

export function parseCliArgs(argv: string[]): CliOptions {
  let values: { media?: string; apply?: boolean; limit?: string; "max-age-hours"?: string };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        media: { type: "string" },
        apply: { type: "boolean", default: false },
        limit: { type: "string" },
        "max-age-hours": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : String(err));
  }

  const mediaId = values.media?.trim();
  if (!mediaId) throw new ValidationError("--media <id> is required");

  return {
    mediaId,
    apply: values.apply === true,
    limit: values.limit === undefined ? undefined : positiveNumber("--limit", values.limit, true),
    maxAgeHours:
      values["max-age-hours"] === undefined
        ? DEFAULT_MAX_AGE_HOURS
        : positiveNumber("--max-age-hours", values["max-age-hours"], false),
  };
}

export interface BackfillResult {
  decisions: CommentDecision[];
  summary: Record<string, number>;
  enqueued: string[];
}

function describeDecision(decision: CommentDecision, nowMs: number): Record<string, unknown> {
  const { comment } = decision;
  const base = {
    commentId: comment.id,
    username: comment.username ?? comment.from?.username,
    text: comment.text,
    timestamp: comment.timestamp,
  };
  return decision.outcome === "candidate"
    ? {
        ...base,
        decision: "candidate",
        trip: decision.candidate.trip,
        ageHours: Math.round(((nowMs - decision.candidate.commentMs) / HOUR_MS) * 10) / 10,
      }
    : { ...base, decision: "skip", reason: decision.reason };
}

export async function runBackfill(options: CliOptions, nowMs: number = Date.now()): Promise<BackfillResult> {
  if (options.maxAgeHours > QUEUE_EXPIRY_HOURS) {
    logger.warn(
      { maxAgeHours: options.maxAgeHours, queueExpiryHours: QUEUE_EXPIRY_HOURS },
      "backfill window is wider than the queue's 6-day expiry — comments older than that are dropped by the drain right after they are enqueued",
    );
  }

  const token = await getCurrentIgToken();
  const business = await fetchBusinessAccount(token);
  const comments = await fetchAllComments(options.mediaId, token);

  // If the media listing omits replies, "ronitReplies" stays 0 and Ronit's public answers
  // are invisible to the filter — this line is how that shows up in a dry run.
  logger.info(
    {
      mediaId: options.mediaId,
      business: business.username,
      comments: comments.length,
      replies: comments.filter((c) => c.parent_id).length,
      ronitReplies: findRonitReplyParents(comments, business).size,
    },
    "backfill: fetched comments",
  );

  const decisions = await planBackfill({
    comments,
    business,
    nowMs,
    maxAgeHours: options.maxAgeHours,
    isProcessed: (commentId) => isMessageProcessed("ig_comment", commentId),
    isQueued: isCommentQueued,
    getConversationMessages: (userId) => fetchConversationMessages(userId, token),
  });

  for (const decision of decisions) logger.info(describeDecision(decision, nowMs), "backfill decision");

  const summary = summarizeDecisions(decisions);
  logger.info({ summary }, "backfill summary");

  if (!options.apply) {
    logger.info("backfill: dry run — nothing enqueued. Re-run with --apply to enqueue the candidates");
    return { decisions, summary, enqueued: [] };
  }

  const selected = selectForEnqueue(decisions, options.limit);
  for (const candidate of selected) {
    enqueueComment({
      commentId: candidate.commentId,
      commenterId: candidate.commenterId,
      commenterUsername: candidate.commenterUsername,
      recipientId: business.id,
      commentText: candidate.text,
      kind: "trip",
      createdAt: candidate.createdAt,
    });
  }
  logger.info(
    { enqueued: selected.length, candidates: summary.candidate ?? 0 },
    "backfill: enqueued — the paced drain sends them",
  );
  return { decisions, summary, enqueued: selected.map((candidate) => candidate.commentId) };
}

// async so that a usage error (thrown by parseCliArgs) is logged like any other failure.
async function main(): Promise<void> {
  await runBackfill(parseCliArgs(process.argv.slice(2)));
}

// Only when run directly (node dist/scripts/backfill-trip-comments.js), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    logger.error({ err }, "backfill failed");
    process.exitCode = 1;
  });
}
