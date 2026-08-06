import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getCurrentIgToken } from "./meta.token.service.js";

const FORM_BASE_URL = "https://www.orhazadik.online";

// Seasonal Uman-hilula campaign flyer (27–30/9 trip, see CLAUDE.md "Uman hilula
// campaign copy — EXPIRES 30/9"). Deliberately hardcoded, not an env var.
const FLYER_IMAGE_URL = "https://api.ronitbarash.site/static/file.jpg";

// The only pickReplyTemplate labels that get the flyer as a second bubble —
// the two uman openers and the two uman answers-after-question.
const FLYER_TEMPLATE_LABELS = new Set([
  "UMAN_PHONE_PRESENT",
  "UMAN_PHONE_MISSING",
  "UMAN_ANSWER_PHONE_PRESENT",
  "UMAN_ANSWER_PHONE_MISSING",
]);

type Service = "uman" | "challah";

/**
 * Resolve the reply template + log label for a (service, phone, path) combo.
 *
 * The routing axis is the *service*; `answered` distinguishes the first-contact
 * reply from the reply sent after the bot asked "challah or uman?". Each of the
 * eight combos has its own template. Only uman + answered + no-phone still
 * carries the "journey to Rabbeinu" teaser + {form_link}; everything else is
 * short and link-free.
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

/** POST the flyer image as a message attachment (same shape as a text send). */
async function postFlyerImage(recipientIgsid: string): Promise<boolean> {
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
    message: { attachments: [{ type: "image", payload: { url: FLYER_IMAGE_URL } }] },
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
    logger.info({ recipientIgsid, url: FLYER_IMAGE_URL }, "IG flyer image sent");
    return true;
  } catch (err) {
    logger.warn({ err, recipientIgsid }, "IG flyer outbound fetch error");
    return false;
  }
}

/**
 * Second chat bubble — the seasonal campaign flyer — sent after certain uman
 * text replies (see FLYER_TEMPLATE_LABELS). Best-effort: never throws, retries
 * exactly once after ~1s on failure, and must never block the webhook's 200 to
 * Meta or the text reply that precedes it.
 */
export async function sendFlyerImage(recipientIgsid: string): Promise<void> {
  // Testing seam — mirror sendIgMessage's dry-run behavior exactly.
  if (env.IG_OUTBOUND_DRYRUN) {
    logger.info({ recipientIgsid, url: FLYER_IMAGE_URL }, "IG flyer image DRY-RUN (not sent)");
    return;
  }

  if (await postFlyerImage(recipientIgsid)) return;

  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (!(await postFlyerImage(recipientIgsid))) {
    logger.error({ recipientIgsid }, "IG flyer image failed after retry — giving up");
  }
}

/** Send the service-routed reply (first-contact when answered=false, post-question when true). */
export async function sendReplyDM(
  recipientIgsid: string,
  args: { service: Service; hasPhone: boolean; answered: boolean },
): Promise<void> {
  const { template, label } = pickReplyTemplate(args);
  const sent = await sendIgMessage(recipientIgsid, template, label);
  if (sent && FLYER_TEMPLATE_LABELS.has(label)) {
    await sendFlyerImage(recipientIgsid);
  }
}

/** Ask a vague lead which service she wants (Entry B step 1 + re-asks). */
export async function sendServiceQuestion(recipientIgsid: string): Promise<void> {
  await sendIgMessage(recipientIgsid, env.IG_MSG_ASK_SERVICE, "ASK_SERVICE");
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
 * Returns true ONLY on a confirmed send (mirrors sendGatewayMessage) so the caller
 * can couple Monday-row creation to a successful DM — a comment never produces a
 * row unless this returned true. The form link is personalized with the COMMENTER's
 * IG id (?ig_id=) so a later form submit de-dupes back to the same row.
 */
export async function sendCommentPrivateReply(
  commentId: string,
  commenterIgsid: string,
): Promise<boolean> {
  const formLink = `${FORM_BASE_URL}/?ig_id=${encodeURIComponent(commenterIgsid)}`;
  const text = env.IG_MSG_COMMENT_UMAN.replace(/\\n/g, "\n").replaceAll("{form_link}", formLink);

  // Testing seam — log the rendered DM and send nothing. Returns false so the
  // caller skips row creation too (no row without a real message).
  if (env.IG_OUTBOUND_DRYRUN) {
    logger.info({ commentId, commenterIgsid, text }, "IG comment Private-Reply DRY-RUN (not sent)");
    return false;
  }

  let token: string;
  try {
    token = await getCurrentIgToken();
  } catch (err) {
    logger.warn({ err, commentId }, "IG comment Private-Reply skipped — token unavailable");
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
        { commentId, commenterIgsid, status: res.status, body: (await res.text()).slice(0, 300) },
        "IG comment Private-Reply non-2xx",
      );
      return false;
    }
    logger.info({ commentId, commenterIgsid, textLen: text.length }, "IG comment Private-Reply sent");
    return true;
  } catch (err) {
    logger.warn({ err, commentId, commenterIgsid }, "IG comment Private-Reply fetch error");
    return false;
  }
}
