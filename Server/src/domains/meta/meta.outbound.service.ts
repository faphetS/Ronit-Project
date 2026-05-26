import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getCurrentIgToken } from "./meta.token.service.js";

const FORM_BASE_URL = "https://www.orhazadik.online";

export async function sendFirstContactDM(
  recipientIgsid: string,
  hasPhone: boolean,
): Promise<void> {
  const template = hasPhone
    ? env.IG_MSG_PHONE_PRESENT
    : env.IG_MSG_PHONE_MISSING;
  const formLink = `${FORM_BASE_URL}/?ig_id=${encodeURIComponent(recipientIgsid)}`;
  const text = template.replace(/\\n/g, "\n").replaceAll("{form_link}", formLink);

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
          template: hasPhone ? "PHONE_PRESENT" : "PHONE_MISSING",
        },
        "IG outbound non-2xx",
      );
      return;
    }
    logger.info(
      {
        recipientIgsid,
        textLen: text.length,
        template: hasPhone ? "PHONE_PRESENT" : "PHONE_MISSING",
      },
      "IG first-contact DM sent",
    );
  } catch (err) {
    logger.warn({ err, recipientIgsid }, "IG outbound fetch error");
  }
}
