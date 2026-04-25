import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { GreenApiWebhook } from "./whatsapp.validator.js";
import { handleOwnerReply, checkAndPromptHoliday, broadcastHolidayCampaign } from "./holiday.service.js";
import { checkAndSendFollowups } from "./followup.service.js";
import type { FollowupTestInjectSchema } from "./whatsapp.validator.js";
import type { z } from "zod";

type FollowupTestBody = z.infer<typeof FollowupTestInjectSchema>;

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function extractText(body: GreenApiWebhook): string | undefined {
  const md = body.messageData;
  if (!md) return undefined;
  return (
    md.textMessageData?.textMessage ??
    md.extendedTextMessageData?.text ??
    md.textMessage ??
    md.quotedMessage?.textMessage ??
    md.quotedMessage?.extendedTextMessage?.text ??
    undefined
  );
}

export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as GreenApiWebhook;

  logger.info({ webhookBody: JSON.stringify(body) }, "WhatsApp webhook raw body");

  res.sendStatus(200);

  const isIncoming = body.typeWebhook === "incomingMessageReceived";
  const isOutgoing = body.typeWebhook === "outgoingMessage" || body.typeWebhook === "outgoingMessageReceived";

  if (!isIncoming && !isOutgoing) {
    return;
  }

  const senderChatId = body.senderData?.chatId ?? body.chatId;
  const text = extractText(body);

  if (!senderChatId || !text) {
    return;
  }

  if (!env.RONIT_OWNER_WA_NUMBER) {
    return;
  }

  const senderDigits = normalizeDigits(senderChatId);
  const ownerDigits = normalizeDigits(env.RONIT_OWNER_WA_NUMBER);

  if (senderDigits.endsWith(ownerDigits) || ownerDigits.endsWith(senderDigits)) {
    logger.info({ senderChatId }, "Owner WhatsApp reply received");
    try {
      await handleOwnerReply(text);
    } catch (err) {
      logger.error({ err, senderChatId }, "Failed to handle owner reply");
    }
  }
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
