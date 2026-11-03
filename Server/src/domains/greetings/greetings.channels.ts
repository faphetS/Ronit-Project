import { env } from "../../config/env.js";
import { sendGatewayMessage } from "../whatsapp/whatsapp.gateway.js";
import type { WhatsAppChannel } from "./outbox.sender.js";
import { ZernioError, zernioFromEnv, type ZernioClient } from "./zernio.client.js";

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

/** Zernio: WhatsApp's own API, so only templates Meta approved. The message id comes back for the receipts. */
export function zernioChannel(client: ZernioClient): WhatsAppChannel {
  return {
    name: "zernio",
    dryRun: false,
    async sendTemplate(to, template) {
      try {
        const { messageId } = await client.sendTemplate({ to, ...template });
        return { ok: true, providerMessageId: messageId };
      } catch (err) {
        return { ok: false, error: err instanceof ZernioError ? `zernio:${err.code}` : err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function greetingsChannelFromEnv(): WhatsAppChannel {
  if (env.GREETINGS_CHANNEL === "gateway") return gatewayChannel;
  if (env.GREETINGS_CHANNEL === "zernio") {
    const client = zernioFromEnv();
    // Set to zernio without its keys: nothing can go out, so nothing pretends to.
    return client ? zernioChannel(client) : dryRunChannel;
  }
  return dryRunChannel;
}
