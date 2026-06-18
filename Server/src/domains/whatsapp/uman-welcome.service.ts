import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { isMessageProcessed, markMessageProcessed } from "../../lib/dedup.js";
import { toMsisdn, sendGatewayMessage } from "./whatsapp.gateway.js";

const DEDUP_SOURCE = "wa_uman_welcome";

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
 * service=uman AND has a phone. Gated by the allowlist and deduped per sender,
 * so it is safe to call from every site where phone/service may have changed.
 */
export async function maybeSendUmanWelcome(input: {
  senderId: string;
  service: "uman" | "challah" | null;
  phone: string | null | undefined;
}): Promise<void> {
  if (input.service !== "uman" || !input.phone) return;

  const to = toMsisdn(input.phone);
  if (!isAllowed(to)) {
    logger.info({ senderId: input.senderId, to }, "Uman WhatsApp welcome skipped — not allowlisted");
    return;
  }

  if (isMessageProcessed(DEDUP_SOURCE, input.senderId)) return;

  await sendGatewayMessage(to, env.WA_MSG_UMAN_WELCOME_1.replace(/\\n/g, "\n"));
  await sendGatewayMessage(to, env.WA_MSG_UMAN_WELCOME_2);

  markMessageProcessed(DEDUP_SOURCE, input.senderId);
  logger.info({ senderId: input.senderId, to }, "Uman WhatsApp welcome sent");
}
