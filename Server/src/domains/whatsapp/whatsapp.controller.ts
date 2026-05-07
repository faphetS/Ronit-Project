import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { GreenApiWebhook } from "./whatsapp.validator.js";
import { checkAndPromptHoliday, broadcastHolidayCampaign } from "./holiday.service.js";
import { checkAndSendFollowups } from "./followup.service.js";
import { handleIncomingFile } from "./whatsapp.service.js";
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

const FILE_MESSAGE_TYPES = new Set([
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
]);

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
  if (!senderChatId) return;

  // --- File detection (incoming only) ---
  const typeMessage = body.messageData?.typeMessage;
  if (isIncoming && typeMessage && FILE_MESSAGE_TYPES.has(typeMessage) && body.messageData?.fileMessageData) {
    try {
      await handleIncomingFile(
        senderChatId,
        body.messageData.fileMessageData,
        body.idMessage ?? "",
      );
    } catch (err) {
      logger.error({ err, senderChatId, typeMessage }, "Failed to handle incoming file");
    }
    return;
  }

  // --- Text message handling ---
  const text = extractText(body);
  if (!text) return;

  if (!env.RONIT_OWNER_WA_NUMBER) return;

  const senderDigits = normalizeDigits(senderChatId);
  const ownerDigits = normalizeDigits(env.RONIT_OWNER_WA_NUMBER);

  if (senderDigits.endsWith(ownerDigits) || ownerDigits.endsWith(senderDigits)) {
    logger.debug({ senderChatId, text }, "Owner text received — no active handler");
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
