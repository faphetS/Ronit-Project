import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getCurrentIgToken } from "./meta.token.service.js";
import type { Trip } from "../../lib/trip.js";

const FORM_BASE_URL = "https://www.orhazadik.online";

// Per-trip flyer, sent as the second bubble after the matching trip reply
// (see sendTripReply below). Deliberately hardcoded, not an env var.
const FLYER_IMAGE_URLS: Record<Trip, string> = {
  kislev: "https://api.ronitbarash.site/static/uman-kislev.jpeg",
  hanukkah: "https://api.ronitbarash.site/static/uman-hanukkah.jpeg",
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

/** Send the trip-routed reply, then that trip's flyer as a second bubble (gated on a confirmed text send). */
export async function sendTripReply(
  recipientIgsid: string,
  args: { trip: Trip; hasPhone: boolean },
): Promise<void> {
  const { template, label } = pickTripTemplate(args);
  const sent = await sendIgMessage(recipientIgsid, template, label);
  if (sent) {
    await sendFlyerImage(recipientIgsid, args.trip);
  }
}

/** Thank a uman lead for handing over her phone after being asked for it. */
export async function sendPhoneThanks(recipientIgsid: string): Promise<void> {
  await sendIgMessage(recipientIgsid, env.IG_MSG_PHONE_THANKS, "PHONE_THANKS");
}

/**
 * Send a Meta "Private Reply" DM to someone who commented on a post. This is the
 * ONLY sanctioned way to DM a commenter (we cannot cold-DM): the recipient is the
 * comment_id, allowed within 7 days of the comment, once per comment.
 *
 * `kind` selects the template: "uman" (default) is the lead-capture funnel DM with
 * {form_link}; "knife" is the direct knife-sale pitch (IG_MSG_COMMENT_KNIFE), which
 * carries no form link and never produces a Monday row.
 *
 * Returns true ONLY on a confirmed send (mirrors sendGatewayMessage) so the caller
 * can couple Monday-row creation to a successful DM — a comment never produces a
 * row unless this returned true. The form link (uman only) is personalized with the
 * COMMENTER's IG id (?ig_id=) so a later form submit de-dupes back to the same row.
 */
export async function sendCommentPrivateReply(
  commentId: string,
  commenterIgsid: string,
  kind: "uman" | "knife" = "uman",
): Promise<boolean> {
  const text =
    kind === "knife"
      ? env.IG_MSG_COMMENT_KNIFE.replace(/\\n/g, "\n")
      : env.IG_MSG_COMMENT_UMAN.replace(/\\n/g, "\n").replaceAll(
          "{form_link}",
          `${FORM_BASE_URL}/?ig_id=${encodeURIComponent(commenterIgsid)}`,
        );

  // Testing seam — log the rendered DM and send nothing. Returns false so the
  // caller skips row creation too (no row without a real message).
  if (env.IG_OUTBOUND_DRYRUN) {
    logger.info({ commentId, commenterIgsid, kind, text }, "IG comment Private-Reply DRY-RUN (not sent)");
    return false;
  }

  let token: string;
  try {
    token = await getCurrentIgToken();
  } catch (err) {
    logger.warn({ err, commentId, kind }, "IG comment Private-Reply skipped — token unavailable");
    return false;
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
    if (!res.ok) {
      logger.warn(
        { commentId, commenterIgsid, kind, status: res.status, body: (await res.text()).slice(0, 300) },
        "IG comment Private-Reply non-2xx",
      );
      return false;
    }
    logger.info({ commentId, commenterIgsid, kind, textLen: text.length }, "IG comment Private-Reply sent");
    return true;
  } catch (err) {
    logger.warn({ err, commentId, commenterIgsid, kind }, "IG comment Private-Reply fetch error");
    return false;
  }
}
