import type { Request, Response } from "express";
import { logger } from "../../config/logger.js";
import { checkAndPromptHoliday, broadcastHolidayCampaign } from "./holiday.service.js";
import { checkAndSendFollowups } from "./followup.service.js";
import type { FollowupTestInjectSchema } from "./whatsapp.validator.js";
import type { z } from "zod";

type FollowupTestBody = z.infer<typeof FollowupTestInjectSchema>;

// Plain inbound receiver — accepts ANY payload, logs it, returns 200.
// GreenAPI parsing/routing was removed; the new gateway's handling will be built here.
export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  logger.info({ webhookBody: JSON.stringify(req.body) }, "Inbound webhook received");
  res.sendStatus(200);
}

export async function testHolidayCheck(_req: Request, res: Response): Promise<void> {
  await checkAndPromptHoliday();
  res.json({ status: "ok" });
}

export async function testBroadcast(_req: Request, res: Response): Promise<void> {
  await broadcastHolidayCampaign();
  res.json({ status: "ok" });
}

export async function testFollowup(req: Request, res: Response): Promise<void> {
  const { daysThreshold } = req.body as FollowupTestBody;
  await checkAndSendFollowups(daysThreshold);
  res.json({ status: "ok" });
}
