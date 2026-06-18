import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/**
 * Normalize a phone to the gateway's required format: digits only, country code
 * prefixed, no "+". Handles the common Israeli mess (trunk-prefix "00", a kept
 * national 0 after +972, local 0XX, and a bare mobile with the leading 0
 * dropped) plus the Philippine test number. This is best-effort normalization;
 * call isValidMsisdn afterwards to reject anything that isn't a real mobile.
 */
export function toMsisdn(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2); // international trunk prefix
  if (d.startsWith("9720")) d = `972${d.slice(4)}`; // +972 with a kept national 0
  if (d.startsWith("0") && d.length === 10) return `972${d.slice(1)}`; // IL mobile local
  if (d.startsWith("0") && d.length === 11) return `63${d.slice(1)}`; // PH mobile local
  if (/^5\d{8}$/.test(d)) return `972${d}`; // bare IL mobile (leading 0 dropped)
  return d;
}

/** True only for a real IL (9725XXXXXXXX) or PH (639XXXXXXXXX) MOBILE msisdn.
 *  Rejects landlines, wrong-length, and wrong-country results. */
export function isValidMsisdn(m: string): boolean {
  return /^972(5\d{8})$/.test(m) || /^639\d{9}$/.test(m);
}

/**
 * Send one WhatsApp message through the custom Supabase "ronit-send" gateway.
 * Returns true ONLY on a confirmed send. Non-throwing: any failure logs and
 * returns false so the caller can decide whether to mark/retry. Success is
 * HTTP 2xx AND the body not explicitly {ok:false} (verified contract:
 * {"ok":true,"gateway":{"status":"sent"}}); all observed failures are non-2xx.
 */
export async function sendGatewayMessage(to: string, text: string): Promise<boolean> {
  if (!env.RONIT_WA_SEND_URL || !env.RONIT_WA_SEND_TOKEN) {
    logger.warn({ to }, "WhatsApp gateway not configured — skipping send");
    return false;
  }

  try {
    const res = await fetch(env.RONIT_WA_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RONIT_WA_SEND_TOKEN}`,
      },
      body: JSON.stringify({ to, text }),
      signal: AbortSignal.timeout(10_000),
    });

    const bodyText = await res.text();

    if (!res.ok) {
      logger.warn({ to, status: res.status, body: bodyText.slice(0, 300) }, "WhatsApp gateway non-2xx");
      return false;
    }

    // 2xx — guard against an application-level failure body (e.g. number not on
    // WhatsApp). Unparseable body on a 2xx is treated as success (lenient, so a
    // real send is never mis-marked as failed → no duplicate resend).
    try {
      const parsed = JSON.parse(bodyText) as { ok?: boolean };
      if (parsed && parsed.ok === false) {
        logger.warn({ to, body: bodyText.slice(0, 300) }, "WhatsApp gateway 200 but ok:false");
        return false;
      }
    } catch {
      /* non-JSON 2xx body — accept as sent */
    }

    logger.info({ to, textLen: text.length }, "WhatsApp message sent via gateway");
    return true;
  } catch (err) {
    logger.warn({ err, to }, "WhatsApp gateway fetch error");
    return false;
  }
}
