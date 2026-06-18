import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { isMessageProcessed, markMessageProcessed } from "../../lib/dedup.js";
import { toMsisdn, isValidMsisdn, sendGatewayMessage } from "./whatsapp.gateway.js";

const DEDUP_SOURCE = "wa_uman_welcome";
// Per-bubble progress: once bubble 1 is confirmed sent we never re-send it, so a
// chronically-failing bubble 2 can't loop the (spammy) bubble 1 on every inbound.
const B1_DONE_SOURCE = "wa_uman_welcome_b1";

// Same Node process: two concurrent webhook requests for the same sender could
// both pass the dedup check before either marks. This guard (checked + added
// synchronously before any await) closes that double-fire window.
const inFlight = new Set<string>();

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

/**
 * Fail-closed allowlist. RONIT_WA_ALLOWED_NUMBERS is a CSV of recipient numbers
 * (any format — each is normalized). "all" disables the gate (production);
 * empty (default) blocks everyone. The gateway is on Ronit's personal WhatsApp
 * during testing, so nothing leaves until a number is explicitly opted in.
 */
export function isAllowed(msisdn: string): boolean {
  const raw = env.RONIT_WA_ALLOWED_NUMBERS.trim();
  if (raw.toLowerCase() === "all") return true;
  if (raw === "") return false;
  const allowed = raw
    .split(",")
    .map((n) => toMsisdn(n.trim()))
    .filter((n) => n.length > 0);
  return allowed.includes(msisdn);
}

/**
 * Send the 2-message Uman welcome the first time a tracked lead is both
 * service=uman AND has a (valid, allowlisted) phone. Deduped per sender and
 * marked ONLY on a confirmed send, so a gateway failure retries on the lead's
 * next inbound message rather than being lost. Idempotent + non-throwing, so
 * callers can fire-and-forget it from any site where phone/service changed.
 */
export async function maybeSendUmanWelcome(input: {
  senderId: string;
  service: "uman" | "challah" | null;
  phone: string | null | undefined;
}): Promise<void> {
  if (input.service !== "uman" || !input.phone) return;

  const to = toMsisdn(input.phone);
  if (!isValidMsisdn(to)) {
    logger.warn(
      { senderId: input.senderId, rawPhone: input.phone, to },
      "Uman WhatsApp welcome skipped — invalid msisdn (not an IL/PH mobile)",
    );
    return; // do NOT mark — a corrected number can still trigger it later
  }
  if (!isAllowed(to)) {
    logger.info({ senderId: input.senderId, to }, "Uman WhatsApp welcome skipped — not allowlisted");
    return;
  }
  if (isMessageProcessed(DEDUP_SOURCE, input.senderId)) return;
  if (inFlight.has(input.senderId)) return;
  inFlight.add(input.senderId);

  try {
    // Bubble 1 — send at most once. If a prior run already delivered it, skip
    // straight to bubble 2 (no resend, no delay) so a failing bubble 2 can never
    // re-loop bubble 1.
    if (!isMessageProcessed(B1_DONE_SOURCE, input.senderId)) {
      const ok1 = await sendGatewayMessage(to, env.WA_MSG_UMAN_WELCOME_1.replace(/\\n/g, "\n"));
      if (!ok1) {
        logger.error(
          { senderId: input.senderId, to },
          "Uman WhatsApp welcome — bubble 1 failed, not marking (retries on next inbound)",
        );
        return;
      }
      markMessageProcessed(B1_DONE_SOURCE, input.senderId);
      await sleep(env.WA_WELCOME_BUBBLE_DELAY_MS); // human-like gap, only when we just sent bubble 1
    }

    const ok2 = await sendGatewayMessage(to, env.WA_MSG_UMAN_WELCOME_2);

    if (ok2) {
      markMessageProcessed(DEDUP_SOURCE, input.senderId);
      logger.info({ senderId: input.senderId, to }, "Uman WhatsApp welcome sent");
    } else {
      logger.error(
        { senderId: input.senderId, to },
        "Uman WhatsApp welcome — bubble 2 failed, not marking (bubble 1 already sent; only bubble 2 retries)",
      );
    }
  } catch (err) {
    logger.error({ err, senderId: input.senderId, to }, "Uman WhatsApp welcome threw — not marking");
  } finally {
    inFlight.delete(input.senderId);
  }
}
