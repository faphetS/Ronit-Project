import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { UnauthorizedError } from "../../lib/errors.js";
import {
  MondayChallengeSchema,
  MondayWebhookEventSchema,
  type TestInjectBody,
} from "./monday.validator.js";
import { moveClosedItem } from "./monday.webhook.service.js";
import { getItemServiceAndPhone } from "./monday.service.js";
import { maybeSendUmanWelcome } from "../whatsapp/uman-welcome.service.js";

export async function handleWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const challenge = MondayChallengeSchema.safeParse(req.body);
  if (challenge.success) {
    res.json({ challenge: challenge.data.challenge });
    return;
  }

  logger.debug({ body: req.body }, "Monday webhook received");

  const parsed = MondayWebhookEventSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn(
      { body: req.body, errors: parsed.error.flatten() },
      "Monday webhook payload did not match expected schema — returning 200 to prevent retries",
    );
    res.status(200).json({ status: "ignored" });
    return;
  }

  const { pulseId } = parsed.data.event;

  try {
    const result = await moveClosedItem(pulseId);
    res.status(200).json({ status: "ok", ...result });
  } catch (err) {
    logger.error(
      { err, pulseId },
      "Failed to duplicate closed item — returning 200 to prevent retries",
    );
    res.status(200).json({ status: "error" });
  }
}

export async function testInject(
  req: Request<unknown, unknown, TestInjectBody>,
  res: Response,
): Promise<void> {
  const result = await moveClosedItem(Number(req.body.itemId));
  res.json({ status: "ok", ...result });
}

// Backwards-compatible secret gate for the Monday lead-ready webhook. Disabled
// (open) when MONDAY_WEBHOOK_SECRET is empty. When set, every POST must carry
// ?token=<secret> in the URL.
export function verifyMondaySecret(req: Request, _res: Response, next: NextFunction): void {
  const secret = env.MONDAY_WEBHOOK_SECRET;
  if (!secret) return next();
  const raw = req.query.token;
  const provided = typeof raw === "string" ? raw : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    logger.warn({ ip: req.ip }, "Monday lead-ready webhook token mismatch — rejected");
    throw new UnauthorizedError("Invalid Monday webhook token");
  }
  next();
}

export async function handleLeadReady(req: Request, res: Response): Promise<void> {
  const challenge = MondayChallengeSchema.safeParse(req.body);
  if (challenge.success) {
    res.json({ challenge: challenge.data.challenge });
    return;
  }

  const parsed = MondayWebhookEventSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn(
      { body: req.body, errors: parsed.error.flatten() },
      "Monday lead-ready webhook payload did not match expected schema — returning 200 to prevent retries",
    );
    res.status(200).json({ status: "ignored" });
    return;
  }

  const { pulseId } = parsed.data.event;

  try {
    const row = await getItemServiceAndPhone(String(pulseId));
    if (row?.service === "uman" && row.phone) {
      await maybeSendUmanWelcome({
        senderId: String(pulseId),
        mondayItemId: String(pulseId),
        service: "uman",
        phone: row.phone,
      });
    }
  } catch (err) {
    logger.error({ err, pulseId }, "handleLeadReady — error processing item, returning 200 to prevent retries");
  }

  res.status(200).json({ status: "ok" });
}
