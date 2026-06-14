import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getCurrentIgToken } from "./meta.token.service.js";

const FORM_BASE_URL = "https://www.orhazadik.online";

type Service = "uman" | "challah";

/**
 * Resolve the reply template + log label for a (service, phone, path) combo.
 *
 * The routing axis is the *service*: challah → plain templates (no link),
 * uman → the "journey to Rabbeinu" templates (with {form_link}). `answered`
 * distinguishes the first-contact reply from the reply sent after the bot asked
 * "challah or uman?"; only three combos differ between the two paths
 * (uman + no-phone is identical, so it reuses IG_MSG_PHONE_MISSING).
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
  if (answered && hasPhone) {
    return { template: env.IG_MSG_UMAN_ANSWER_PHONE_PRESENT, label: "UMAN_ANSWER_PHONE_PRESENT" };
  }
  return hasPhone
    ? { template: env.IG_MSG_PHONE_PRESENT, label: "UMAN_PHONE_PRESENT" }
    : { template: env.IG_MSG_PHONE_MISSING, label: "UMAN_PHONE_MISSING" };
}

/** Decode literal "\n" → newline, substitute {form_link}, POST to IG Graph API. */
async function sendIgMessage(
  recipientIgsid: string,
  template: string,
  label: string,
): Promise<void> {
  const formLink = `${FORM_BASE_URL}/?ig_id=${encodeURIComponent(recipientIgsid)}`;
  const text = template.replace(/\\n/g, "\n").replaceAll("{form_link}", formLink);

  // Testing seam — log the exact rendered message and send nothing.
  if (env.IG_OUTBOUND_DRYRUN) {
    logger.info({ recipientIgsid, template: label, text }, "IG DM DRY-RUN (not sent)");
    return;
  }

  let token: string;
  try {
    token = await getCurrentIgToken();
  } catch (err) {
    logger.warn({ err, recipientIgsid }, "IG outbound skipped — token unavailable");
    return;
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
      return;
    }
    logger.info(
      { recipientIgsid, textLen: text.length, template: label },
      "IG DM sent",
    );
  } catch (err) {
    logger.warn({ err, recipientIgsid }, "IG outbound fetch error");
  }
}

/** Send the service-routed reply (first-contact when answered=false, post-question when true). */
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
