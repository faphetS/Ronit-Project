import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import { handleIncomingMessage } from "./meta.service.js";
import { handleIncomingComment } from "./meta.comment.service.js";
import {
  MetaWebhookPayloadSchema,
  type TestInjectBody,
} from "./meta.validator.js";

/** Meta GET verification handshake — echoes hub.challenge as text/plain. */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    !env.META_VERIFY_TOKEN ||
    mode !== "subscribe" ||
    token !== env.META_VERIFY_TOKEN ||
    typeof challenge !== "string"
  ) {
    logger.warn({ mode }, "Meta verify handshake failed");
    res.status(403).send("Forbidden");
    return;
  }

  res.type("text/plain").send(challenge);
}

function verifyHmac(req: Request, rawBody: Buffer): boolean {
  if (!env.META_APP_SECRET) {
    logger.warn(
      "META_APP_SECRET not set — skipping HMAC verification (placeholder mode)",
    );
    return true;
  }

  const header = req.header("x-hub-signature-256");
  if (!header) return false;

  const [algo, sig] = header.split("=");
  if (algo !== "sha256" || !sig) return false;

  const expected = crypto
    .createHmac("sha256", env.META_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Meta POST webhook receiver.
 *
 * req.body arrives as a Buffer because express.raw() is mounted on this path
 * before express.json() (see server.ts). HMAC verification MUST run against
 * raw bytes — parse only after the signature passes.
 */
export async function receiveWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.body as Buffer;

  if (!verifyHmac(req, raw)) {
    throw new UnauthorizedError("Invalid Meta webhook signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError(
      400,
      "Invalid JSON in Meta webhook body",
      "META_INVALID_JSON",
    );
  }

  const result = MetaWebhookPayloadSchema.safeParse(payload);
  if (!result.success) {
    logger.warn(
      { errors: result.error.flatten() },
      "Meta webhook payload did not match schema — returning 200 to prevent retries",
    );
    res.status(200).json({ status: "ignored" });
    return;
  }
  const parsed = result.data;

  for (const entry of parsed.entry) {
    for (const event of entry.messaging ?? []) {
      const messageText = event.message?.text;
      if (!messageText) continue;

      // Skip echoes: messages SENT BY the business account (Ronit's manual
      // replies in the IG app, or our own automated outbound sends) come back
      // to us as webhook events with is_echo=true. Processing them would burn
      // LLM calls on our own messages and could create spurious Monday rows.
      if (event.message?.is_echo) {
        logger.debug(
          { mid: event.message.mid, senderId: event.sender.id },
          "Skipping echo (message sent by business account)",
        );
        continue;
      }

      const messageId =
        event.message?.mid ??
        (event.timestamp != null ? `${event.sender.id}:${event.timestamp}` : undefined);

      try {
        const result = await handleIncomingMessage({
          messageText,
          senderId: event.sender.id,
          senderUsername: event.sender.username,
          messageId,
        });
        logger.info(
          {
            senderId: event.sender.id,
            messageId,
            interested: result.classification.interested,
            service: result.classification.service,
            itemId: result.itemId,
          },
          "Instagram DM processed",
        );
      } catch (err) {
        // Per-message failure must not 5xx the webhook — Meta would retry and
        // we'd risk duplicate Monday rows for messages that did succeed.
        logger.error(
          { err, senderId: event.sender.id, messageId },
          "Failed to process Instagram DM — continuing",
        );
      }
    }

    // Comment events (field="comments"): a comment containing "אומן" → a
    // Private-Reply DM + a Uman lead (the handler is master-gated OFF by
    // default). Only new comments (verb add/unset) carrying text + a commenter
    // id + a comment id are routed.
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const v = change.value;
      if (!v?.text || !v.from?.id || !v.id) continue;
      if (v.verb && v.verb !== "add") continue;
      try {
        await handleIncomingComment({
          commentId: v.id,
          commentText: v.text,
          commenterId: v.from.id,
          commenterUsername: v.from.username,
          mediaId: v.media?.id,
          recipientId: entry.id,
        });
      } catch (err) {
        logger.error({ err, commentId: v.id }, "Failed to process IG comment — continuing");
      }
    }
  }

  // Always 200 after HMAC passes — Meta retries non-2xx and we don't want duplicate writes.
  res.status(200).json({ status: "ok" });
}

/** Dev-only end-to-end tester. Mounted only in non-production. */
export async function testInject(
  req: Request<unknown, unknown, TestInjectBody>,
  res: Response,
): Promise<void> {
  const result = await handleIncomingMessage(req.body);
  res.json({ status: "ok", ...result });
}
