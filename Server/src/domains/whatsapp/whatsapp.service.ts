import { logger } from "../../config/logger.js";
import { formatChatId, greenApiClient } from "./whatsapp.client.js";

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
