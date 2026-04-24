import type { Request, Response } from "express";
import { logger } from "../../config/logger.js";
import {
  MondayChallengeSchema,
  MondayWebhookEventSchema,
  type TestInjectBody,
} from "./monday.validator.js";
import { duplicateClosedItem } from "./monday.webhook.service.js";

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
    const result = await duplicateClosedItem(pulseId);
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
  const result = await duplicateClosedItem(Number(req.body.itemId));
  res.json({ status: "ok", ...result });
}
