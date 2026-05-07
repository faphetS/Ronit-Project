import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../config/logger.js";
import { findLeadByPhoneAllBoards, uploadFileToColumn } from "../monday/monday.service.js";
import { downloadFile, formatChatId, greenApiClient } from "./whatsapp.client.js";

export interface LeadSendTarget {
  itemId: string;
  phone: string;
  name: string;
}

export interface BroadcastResult {
  sent: number;
  failed: number;
}

export async function sendWhatsApp(phone: string, message: string): Promise<string> {
  const chatId = formatChatId(phone);
  const result = await greenApiClient.sendMessage(chatId, message);
  logger.info({ chatId, idMessage: result.idMessage }, "WhatsApp message sent");
  return result.idMessage;
}

export async function handleIncomingFile(
  senderChatId: string,
  fileMessageData: { downloadUrl: string; fileName?: string; mimeType?: string; caption?: string },
  idMessage: string,
): Promise<void> {
  const digits = senderChatId.replace(/@.*$/, "").replace(/\D/g, "");

  logger.info(
    { senderChatId, digits, fileName: fileMessageData.fileName, mimeType: fileMessageData.mimeType },
    "Incoming file detected — checking if sender is a known lead",
  );

  const lead = await findLeadByPhoneAllBoards(digits);

  if (!lead) {
    logger.info({ digits }, "Sender is not a known lead — skipping file save");
    return;
  }

  let buffer: Buffer;

  if (fileMessageData.downloadUrl) {
    const fileRes = await fetch(fileMessageData.downloadUrl);
    if (!fileRes.ok) {
      throw new AppError(
        502,
        `Direct file download HTTP ${fileRes.status} from ${fileMessageData.downloadUrl}`,
        "FILE_DIRECT_DOWNLOAD_ERROR",
      );
    }
    buffer = Buffer.from(await fileRes.arrayBuffer());
  } else {
    const result = await downloadFile(senderChatId, idMessage);
    buffer = result.buffer;
  }

  const fileName = fileMessageData.fileName
    ?? `whatsapp-file-${Date.now()}.${extensionFromMime(fileMessageData.mimeType)}`;

  await uploadFileToColumn(lead.itemId, env.MONDAY_COL_FILES_ID, buffer, fileName);

  logger.info(
    { itemId: lead.itemId, leadName: lead.name, boardId: lead.boardId, fileName },
    "WhatsApp file saved to Monday.com lead",
  );
}

function extensionFromMime(mimeType?: string): string {
  if (!mimeType) return "bin";
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[mimeType] ?? mimeType.split("/")[1] ?? "bin";
}

export async function broadcastToLeads(
  message: string,
  leads: LeadSendTarget[],
): Promise<BroadcastResult> {
  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      await sendWhatsApp(lead.phone, message);
      sent++;
    } catch (err) {
      failed++;
      logger.error({ err, itemId: lead.itemId, phone: lead.phone }, "Failed to send WhatsApp to lead");
    }

    if (leads.indexOf(lead) < leads.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  logger.info({ sent, failed, total: leads.length }, "WhatsApp broadcast complete");
  return { sent, failed };
}
