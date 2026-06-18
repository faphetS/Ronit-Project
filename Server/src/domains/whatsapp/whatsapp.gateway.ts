import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/**
 * Normalize a phone to the gateway's required format: digits only, country code
 * prefixed, no "+". IL local (0XX, 10 digits) → 972XX; PH local (0XX, 11 digits)
 * → 63XX; already country-coded values pass through. The two local cases both
 * start with "0" and are told apart purely by length (IL=10, PH=11).
 */
export function toMsisdn(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 10) return `972${d.slice(1)}`;
  if (d.startsWith("0") && d.length === 11) return `63${d.slice(1)}`;
  return d;
}

/**
 * Send one WhatsApp message through the custom Supabase "ronit-send" gateway.
 * Non-fatal: logs and returns on any failure so it never breaks the caller's
 * critical path (mirrors the IG outbound convention).
 */
export async function sendGatewayMessage(to: string, text: string): Promise<void> {
  if (!env.RONIT_WA_SEND_URL || !env.RONIT_WA_SEND_TOKEN) {
    logger.warn({ to }, "WhatsApp gateway not configured — skipping send");
    return;
  }

  try {
    const res = await fetch(env.RONIT_WA_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RONIT_WA_SEND_TOKEN}`,
      },
      body: JSON.stringify({ to, text }),
    });

    if (!res.ok) {
      logger.warn(
        { to, status: res.status, body: (await res.text()).slice(0, 300) },
        "WhatsApp gateway non-2xx",
      );
      return;
    }

    logger.info({ to, textLen: text.length }, "WhatsApp message sent via gateway");
  } catch (err) {
    logger.warn({ err, to }, "WhatsApp gateway fetch error");
  }
}
