import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import { handleTranscriptReady, handleTestInject } from "./calls.service.js";
import { TimelessWebhookPayloadSchema } from "./calls.validator.js";
import type { CallTestInjectBody } from "./calls.validator.js";

function verifyHmac(req: Request, rawBody: Buffer): boolean {
  if (!env.TIMELESS_WEBHOOK_SECRET) {
    logger.warn(
      "TIMELESS_WEBHOOK_SECRET not set — skipping HMAC verification (placeholder mode)",
    );
    return true;
  }

  const header = req.header("x-webhook-signature");
  if (!header) return false;

  const [algo, sig] = header.split("=");
  if (algo !== "sha256" || !sig) return false;

  const expected = crypto
    .createHmac("sha256", env.TIMELESS_WEBHOOK_SECRET)
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

export async function receiveWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.body as Buffer;

  if (!verifyHmac(req, raw)) {
    throw new UnauthorizedError("Invalid Timeless webhook signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError(
      400,
      "Invalid JSON in Timeless webhook body",
      "TIMELESS_INVALID_JSON",
    );
  }

  const parsed = TimelessWebhookPayloadSchema.parse(payload);

  try {
    await handleTranscriptReady(parsed.meeting_id);
  } catch (err) {
    logger.error(
      { err, meetingId: parsed.meeting_id },
      "Failed to process Timeless transcript — returning 200 to prevent retries",
    );
  }

  res.status(200).json({ status: "ok" });
}

export async function testInject(
  req: Request<unknown, unknown, CallTestInjectBody>,
  res: Response,
): Promise<void> {
  const result = await handleTestInject(req.body);
  res.json({ status: "ok", ...result });
}
