import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import { getCurrentIgToken } from "./meta.token.service.js";
import type { Trip } from "../../lib/trip.js";

const FORM_BASE_URL = "https://www.orhazadik.online";

// Per-trip flyer, sent as the second bubble after the matching trip reply
// (see sendTripReply below). Deliberately hardcoded, not an env var.
//
// A replaced flyer gets a NEW filename rather than overwriting the old one:
// we hand Meta a URL and Meta fetches it, so reusing a URL risks it serving a
// cached copy of the previous image — which would look like a failed deploy
// while leads quietly received the wrong times. The superseded file stays in
// public/ (unreferenced) so the old artwork is still recoverable.
const FLYER_IMAGE_URLS: Record<Trip, string> = {
  kislev: "https://api.ronitbarash.site/static/uman-kislev.jpeg",
  // v2 (2026-09-29): flight times moved (SKYUP 518/517 instead of 516/515) and
  // the daily programme shifted with them. Dates and price are unchanged, so no
  // copy or detectTrip change was needed. Supersedes uman-hanukkah.jpeg.
  hanukkah: "https://api.ronitbarash.site/static/uman-hanukkah-v2.jpeg",
};

type Service = "uman" | "challah";

/**
 * Resolve the reply template + log label for a (service, phone, path) combo.
 *
 * The routing axis is the *service*; `answered` distinguishes the first-contact
 * reply from the reply sent after the bot asked "challah or uman?". Each of the
 * eight combos has its own template. Only uman + answered + no-phone still
 * carries the "journey to Rabbeinu" teaser + {form_link}; everything else is
 * short and link-free.
 *
 * NOTE (two-trip flow, 2026-09-16): the challah branches are current and used
 * by the DM flow. The uman branches below are DEPRECATED and no longer reached
 * from meta.service.ts — a uman lead now goes through sendTripAsk/sendTripReply
 * (see pickTripTemplate below) instead. Kept working (not deleted) for the same
 * "no silent deploy trap" reason as the deprecated env templates it reads.
 */
export function pickReplyTemplate(args: {
  service: Service;
  hasPhone: boolean;
  answered: boolean;
}): { template: string; label: string } {
  const { service, hasPhone, answered } = args;

  if (service === "challah") {
    if (answered) {
      return hasPhone
        ? { template: env.IG_MSG_CHALLAH_ANSWER_PHONE_PRESENT, label: "CHALLAH_ANSWER_PHONE_PRESENT" }
        : { template: env.IG_MSG_CHALLAH_ANSWER_PHONE_MISSING, label: "CHALLAH_ANSWER_PHONE_MISSING" };
    }
    return hasPhone
      ? { template: env.IG_MSG_SERVICE_PHONE_PRESENT, label: "CHALLAH_PHONE_PRESENT" }
      : { template: env.IG_MSG_SERVICE_PHONE_MISSING, label: "CHALLAH_PHONE_MISSING" };
  }

  // uman
  if (answered) {
    return hasPhone
      ? { template: env.IG_MSG_UMAN_ANSWER_PHONE_PRESENT, label: "UMAN_ANSWER_PHONE_PRESENT" }
      : { template: env.IG_MSG_UMAN_ANSWER_PHONE_MISSING, label: "UMAN_ANSWER_PHONE_MISSING" };
  }
  return hasPhone
    ? { template: env.IG_MSG_PHONE_PRESENT, label: "UMAN_PHONE_PRESENT" }
    : { template: env.IG_MSG_PHONE_MISSING, label: "UMAN_PHONE_MISSING" };
}

/**
 * Decode literal "\n" → newline, substitute {form_link}, POST to IG Graph API.
 * Returns whether the send actually succeeded (dry-run counts as success) so
 * callers can gate follow-on sends — e.g. the flyer bubble — on it.
 */
async function sendIgMessage(
  recipientIgsid: string,
  template: string,
  label: string,
): Promise<boolean> {
  const formLink = `${FORM_BASE_URL}/?ig_id=${encodeURIComponent(recipientIgsid)}`;
  const text = template.replace(/\\n/g, "\n").replaceAll("{form_link}", formLink);

  // Testing seam — log the exact rendered message and send nothing.
  if (env.IG_OUTBOUND_DRYRUN) {
    logger.info({ recipientIgsid, template: label, text }, "IG DM DRY-RUN (not sent)");
    return true;
  }

  let token: string;
  try {
    token = await getCurrentIgToken();
  } catch (err) {
    logger.warn({ err, recipientIgsid }, "IG outbound skipped — token unavailable");
    return false;
  }

  const url = `https://graph.instagram.com/v23.0/me/messages?access_token=${encodeURIComponent(token)}`;
  const body = JSON.stringify({
    recipient: { id: recipientIgsid },
    message: { text },
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      logger.warn(
        {
          recipientIgsid,
          status: res.status,
          body: (await res.text()).slice(0, 300),
          template: label,
        },
        "IG outbound non-2xx",
      );
      return false;
    }
    logger.info(
      { recipientIgsid, textLen: text.length, template: label },
      "IG DM sent",
    );
    return true;
  } catch (err) {
    logger.warn({ err, recipientIgsid }, "IG outbound fetch error");
    return false;
  }
}

/** POST an image as a message attachment (same shape as a text send). */
async function postFlyerImage(recipientIgsid: string, imageUrl: string): Promise<boolean> {
  let token: string;
  try {
    token = await getCurrentIgToken();
  } catch (err) {
    logger.warn({ err, recipientIgsid }, "IG flyer outbound skipped — token unavailable");
    return false;
  }

  const url = `https://graph.instagram.com/v23.0/me/messages?access_token=${encodeURIComponent(token)}`;
  // graph.instagram.com (Instagram-login flavor) documents `attachments` as an
  // ARRAY — not Messenger's singular `attachment` object.
  const body = JSON.stringify({
    recipient: { id: recipientIgsid },
    message: { attachments: [{ type: "image", payload: { url: imageUrl } }] },
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      logger.warn(
        { recipientIgsid, status: res.status, body: (await res.text()).slice(0, 300) },
        "IG flyer outbound non-2xx",
      );
      return false;
    }
    logger.info({ recipientIgsid, url: imageUrl }, "IG flyer image sent");
    return true;
  } catch (err) {
    logger.warn({ err, recipientIgsid }, "IG flyer outbound fetch error");
    return false;
  }
}

/**
 * Second chat bubble — the trip flyer — sent after the matching trip reply
 * (see sendTripReply). Best-effort: never throws, retries exactly once after
 * ~1s on failure, and must never block the webhook's 200 to Meta or the text
 * reply that precedes it.
 */
export async function sendFlyerImage(recipientIgsid: string, trip: Trip): Promise<void> {
  const imageUrl = FLYER_IMAGE_URLS[trip];

  // Testing seam — mirror sendIgMessage's dry-run behavior exactly.
  if (env.IG_OUTBOUND_DRYRUN) {
    logger.info({ recipientIgsid, trip, url: imageUrl }, "IG flyer image DRY-RUN (not sent)");
    return;
  }

  if (await postFlyerImage(recipientIgsid, imageUrl)) return;

  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (!(await postFlyerImage(recipientIgsid, imageUrl))) {
    logger.error({ recipientIgsid }, "IG flyer image failed after retry — giving up");
  }
}

/**
 * Send the service-routed reply (first-contact when answered=false, post-question
 * when true). DEPRECATED for uman (see pickReplyTemplate) — uman leads now go
 * through sendTripAsk/sendTripReply; this never sends a flyer (flyers are
 * trip-specific, see sendTripReply).
 */
export async function sendReplyDM(
  recipientIgsid: string,
  args: { service: Service; hasPhone: boolean; answered: boolean },
): Promise<void> {
  const { template, label } = pickReplyTemplate(args);
  await sendIgMessage(recipientIgsid, template, label);
}

/** Ask a vague lead which service she wants (Entry B step 1 + re-asks). */
export async function sendServiceQuestion(recipientIgsid: string): Promise<void> {
  await sendIgMessage(recipientIgsid, env.IG_MSG_ASK_SERVICE, "ASK_SERVICE");
}

/** Ask a known-uman lead WHICH trip she wants (asked once service is known; re-asked up to the cap). No flyer — she has not chosen yet. */
export async function sendTripAsk(recipientIgsid: string): Promise<void> {
  await sendIgMessage(recipientIgsid, env.IG_MSG_UMAN_TRIP_ASK, "UMAN_TRIP_ASK");
}

/** Resolve the trip-routed reply template + log label for a (trip, phone) combo. */
export function pickTripTemplate(args: { trip: Trip; hasPhone: boolean }): {
  template: string;
  label: string;
} {
  const { trip, hasPhone } = args;

  if (trip === "kislev") {
    return hasPhone
      ? { template: env.IG_MSG_UMAN_KISLEV_PHONE_PRESENT, label: "UMAN_KISLEV_PHONE_PRESENT" }
      : { template: env.IG_MSG_UMAN_KISLEV_PHONE_MISSING, label: "UMAN_KISLEV_PHONE_MISSING" };
  }
  return hasPhone
    ? { template: env.IG_MSG_UMAN_HANUKKAH_PHONE_PRESENT, label: "UMAN_HANUKKAH_PHONE_PRESENT" }
    : { template: env.IG_MSG_UMAN_HANUKKAH_PHONE_MISSING, label: "UMAN_HANUKKAH_PHONE_MISSING" };
}

/**
 * Send the trip-routed reply, then that trip's flyer as a second bubble (gated on a
 * confirmed text send). Resolves true iff the TEXT bubble went out — the flyer is
 * best-effort and never changes the result.
 */
export async function sendTripReply(
  recipientIgsid: string,
  args: { trip: Trip; hasPhone: boolean },
): Promise<boolean> {
  const { template, label } = pickTripTemplate(args);
  const sent = await sendIgMessage(recipientIgsid, template, label);
  if (sent) {
    await sendFlyerImage(recipientIgsid, args.trip);
  }
  return sent;
}

/** Thank a uman lead for handing over her phone after being asked for it. */
export async function sendPhoneThanks(recipientIgsid: string): Promise<void> {
  await sendIgMessage(recipientIgsid, env.IG_MSG_PHONE_THANKS, "PHONE_THANKS");
}

/**
 * What a Private-Reply attempt came back as. The values are split by what the caller
 * should do NEXT, not by HTTP status:
 *  - sent            delivered.
 *  - blocked         she cannot be messaged (privacy settings): tell her publicly, never retry.
 *  - maybe-blocked   a blocked-looking signature (code 100, subcode 2534025) that may also come
 *                    back when an earlier attempt of this very send already landed — so the
 *                    caller only trusts it as "blocked" on a first try.
 *  - drop            permanent for this comment (already answered, comment gone, no such user):
 *                    nothing worth telling her, never retry.
 *  - rejected        some other 4xx we do not recognise: a few retries, then give up.
 *  - transient       network error / 5xx / Graph codes 1 and 2: retry with backoff.
 *  - rate-limited    HTTP 429 / Graph 4, 17, 32, 613: stop sending for a while.
 *  - token           token unavailable / Graph 190: stop sending until it is fixed.
 *  - action-blocked  Graph 368, Meta flagged the account's behaviour: stop for a long while.
 *  - dry-run         IG_OUTBOUND_DRYRUN — nothing was sent.
 */
export type PrivateReplyOutcome =
  | "sent"
  | "blocked"
  | "maybe-blocked"
  | "drop"
  | "rejected"
  | "transient"
  | "rate-limited"
  | "token"
  | "action-blocked"
  | "dry-run";

interface GraphError {
  code?: number;
  subcode?: number;
  message?: string;
  userMessage?: string;
  traceId?: string;
}

// Meta's error envelope is { error: { code, error_subcode, message, error_user_msg, fbtrace_id } },
// but a proxy or an outage can put anything in the body — every field is checked, none assumed.
function parseGraphError(body: string): GraphError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {};
  }
  const error = typeof parsed === "object" && parsed !== null ? (parsed as { error?: unknown }).error : undefined;
  if (typeof error !== "object" || error === null) return {};

  const fields = error as Record<string, unknown>;
  const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);
  const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
  return {
    code: num(fields.code),
    subcode: num(fields.error_subcode),
    message: str(fields.message),
    userMessage: str(fields.error_user_msg),
    traceId: str(fields.fbtrace_id),
  };
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
// Permanent per-comment failures. Checked against both fields because Meta reports some of
// these as the top-level code and others as the subcode.
const SILENT_DROP_VALUES = new Set([10900, 2534022, 2534014, 2018001]);

function classifyFailure(status: number, { code, subcode }: GraphError): PrivateReplyOutcome {
  if (code === 551) return "blocked";
  if (code === 100 && subcode === 2534025) return "maybe-blocked";
  if (code === 368) return "action-blocked";
  if (status === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code))) return "rate-limited";
  if (code === 190) return "token";
  if (
    (code !== undefined && SILENT_DROP_VALUES.has(code)) ||
    (subcode !== undefined && SILENT_DROP_VALUES.has(subcode)) ||
    (code === 100 && subcode === 33)
  ) {
    return "drop";
  }
  if (status >= 500 || code === 1 || code === 2) return "transient";
  if (status >= 400 && status < 500) return "rejected";
  return "transient";
}

function privateReplyText(kind: "uman" | "knife" | "trip", commenterIgsid: string, trip?: Trip): string {
  if (kind === "knife") return env.IG_MSG_COMMENT_KNIFE.replace(/\\n/g, "\n");
  if (kind === "trip") {
    if (!trip) throw new AppError(500, "A trip private reply needs the trip it is for", "TRIP_REQUIRED");
    // No phone yet — she has only commented — so always the ask-for-phone variant.
    return pickTripTemplate({ trip, hasPhone: false }).template.replace(/\\n/g, "\n");
  }
  return env.IG_MSG_COMMENT_UMAN.replace(/\\n/g, "\n").replaceAll(
    "{form_link}",
    `${FORM_BASE_URL}/?ig_id=${encodeURIComponent(commenterIgsid)}`,
  );
}

/**
 * Send a Meta "Private Reply" DM to someone who commented on a post. This is the
 * ONLY sanctioned way to DM a commenter (we cannot cold-DM): the recipient is the
 * comment_id, allowed within 7 days of the comment, once per comment, text only.
 *
 * `kind` selects the template: "uman" is the lead-capture funnel DM with {form_link};
 * "knife" is the direct knife-sale pitch (IG_MSG_COMMENT_KNIFE); "trip" is that trip's
 * no-phone reply (`trip` required) — the flyer cannot ride along, it is sent after she
 * answers (see the owed-flyer marks in db.ts).
 *
 * Resolves to "sent" ONLY on a confirmed send, so the caller can couple Monday-row
 * creation to a successful DM; every other outcome says what to do instead (see
 * PrivateReplyOutcome). Never throws for a failed send.
 */
export async function sendCommentPrivateReply(
  commentId: string,
  commenterIgsid: string,
  kind: "uman" | "knife" | "trip",
  trip?: Trip,
): Promise<PrivateReplyOutcome> {
  const text = privateReplyText(kind, commenterIgsid, trip);

  // Testing seam — log the rendered DM and send nothing, so the caller creates no row
  // and drops the queue item instead of retrying a send that can never happen.
  if (env.IG_OUTBOUND_DRYRUN) {
    logger.info({ commentId, commenterIgsid, kind, text }, "IG comment Private-Reply DRY-RUN (not sent)");
    return "dry-run";
  }

  let token: string;
  try {
    token = await getCurrentIgToken();
  } catch (err) {
    logger.warn({ err, commentId, kind }, "IG comment Private-Reply skipped — token unavailable");
    return "token";
  }

  const url = `https://graph.instagram.com/v23.0/me/messages?access_token=${encodeURIComponent(token)}`;
  const body = JSON.stringify({
    recipient: { comment_id: commentId },
    message: { text },
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) {
      logger.info({ commentId, commenterIgsid, kind, textLen: text.length }, "IG comment Private-Reply sent");
      return "sent";
    }

    const raw = await res.text();
    const error = parseGraphError(raw);
    const outcome = classifyFailure(res.status, error);
    logger.warn(
      {
        commentId,
        commenterIgsid,
        kind,
        status: res.status,
        code: error.code,
        error_subcode: error.subcode,
        error_message: error.message,
        error_user_msg: error.userMessage,
        fbtrace_id: error.traceId,
        outcome,
        body: raw.slice(0, 2000),
      },
      "IG comment Private-Reply non-2xx",
    );
    return outcome;
  } catch (err) {
    logger.warn({ err, commentId, commenterIgsid, kind }, "IG comment Private-Reply fetch error");
    return "transient";
  }
}

/**
 * Public reply under a comment (e.g. "a private message was sent to you"). Best-effort
 * and never retried: it never throws, and a failure is only logged. The text goes out
 * exactly as given.
 */
export async function postCommentReply(commentId: string, text: string): Promise<boolean> {
  if (env.IG_OUTBOUND_DRYRUN) {
    logger.info({ commentId, text }, "IG comment public reply DRY-RUN (not posted)");
    return true;
  }

  let token: string;
  try {
    token = await getCurrentIgToken();
  } catch (err) {
    logger.warn({ err, commentId }, "IG comment public reply skipped — token unavailable");
    return false;
  }

  const url = `https://graph.instagram.com/v23.0/${encodeURIComponent(commentId)}/replies?access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok) {
      logger.warn(
        { commentId, status: res.status, body: (await res.text()).slice(0, 2000) },
        "IG comment public reply non-2xx",
      );
      return false;
    }
    logger.info({ commentId, textLen: text.length }, "IG comment public reply posted");
    return true;
  } catch (err) {
    logger.warn({ err, commentId }, "IG comment public reply fetch error");
    return false;
  }
}
