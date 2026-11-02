import { env } from "../../config/env.js";
import { sendGatewayMessage } from "../whatsapp/whatsapp.gateway.js";
import type { WhatsAppChannel } from "./outbox.sender.js";

/** Sends nothing: the sender logs each message and marks it skipped ("dry-run"). Test data only. */
export const dryRunChannel: WhatsAppChannel = {
  name: "dry-run",
  dryRun: true,
  async sendText() {
    return { ok: false, error: "dry-run channel never sends" };
  },
};

/** The existing ronit-send gateway: plain text, no message id back. */
export const gatewayChannel: WhatsAppChannel = {
  name: "gateway",
  dryRun: false,
  async sendText(to, text) {
    return (await sendGatewayMessage(to, text))
      ? { ok: true, providerMessageId: null }
      : { ok: false, error: "gateway-send-failed" };
  },
};

export function greetingsChannelFromEnv(): WhatsAppChannel {
  return env.GREETINGS_CHANNEL === "gateway" ? gatewayChannel : dryRunChannel;
}
