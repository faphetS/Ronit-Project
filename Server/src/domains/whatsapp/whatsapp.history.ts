import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { toMsisdn } from "./whatsapp.gateway.js";

/**
 * Read the timestamp (epoch ms) of a contact's most recent WhatsApp message — inbound OR
 * outbound, whichever is newest — via the Clix "ronit-history" gateway endpoint. Used to
 * anchor the follow-up clock to the real last conversation.
 *
 * Non-throwing: any failure (not configured, non-2xx, empty history, malformed body) returns
 * null so the caller can fall back to "now". History is forward-capturing and only
 * best-effort for old chats, so null / empty legitimately means "no captured activity" →
 * treat as a fresh start.
 */
export async function getLastWaActivityMs(phone: string): Promise<number | null> {
  if (!env.RONIT_WA_HISTORY_URL || !env.RONIT_WA_HISTORY_TOKEN) {
    logger.warn({ phone }, "WhatsApp history not configured — skipping");
    return null;
  }

  const contact = toMsisdn(phone);

  try {
    const res = await fetch(env.RONIT_WA_HISTORY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RONIT_WA_HISTORY_TOKEN}`,
      },
      body: JSON.stringify({ contact, type: "person", limit: 1 }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn({ contact, status: res.status, body: body.slice(0, 200) }, "WhatsApp history non-2xx");
      return null;
    }

    const json = (await res.json()) as { messages?: Array<{ timestamp?: number }> };
    const ts = json.messages?.[0]?.timestamp; // newest-first; count:0 → undefined
    if (typeof ts !== "number") return null;
    return ts * 1000; // endpoint returns Unix seconds
  } catch (err) {
    logger.warn({ err, contact }, "WhatsApp history fetch error");
    return null;
  }
}
