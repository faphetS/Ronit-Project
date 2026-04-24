import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { classifyLead, type Classification } from "../../lib/classify.js";
import {
  isMessageProcessed,
  markMessageProcessed,
  findKnownSender,
  upsertKnownSender,
  updateSenderPhone,
} from "../../lib/dedup.js";
import { createLeadRow, updateItemPhone } from "../monday/monday.service.js";

const supabaseEnabled = () => !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY;

export async function handleIncomingMessage(input: {
  messageText: string;
  senderId?: string;
  senderUsername?: string;
  messageId?: string;
}): Promise<{ itemId: string | null; classification: Classification }> {
  if (supabaseEnabled() && input.messageId) {
    const alreadyProcessed = await isMessageProcessed("meta", input.messageId);
    if (alreadyProcessed) {
      logger.info({ messageId: input.messageId }, "Skipping duplicate webhook message");
      return { itemId: null, classification: { interested: false, service: null, extractedName: null, extractedPhone: null, confidence: 0, rawResponse: "" } };
    }
  }

  const classification = await classifyLead(input);

  if (supabaseEnabled() && input.messageId) {
    await markMessageProcessed("meta", input.messageId);
  }

  if (!classification.interested) {
    logger.info(
      {
        senderUsername: input.senderUsername,
        confidence: classification.confidence,
      },
      "Lead classified as not interested — skipping Monday write",
    );
    return { itemId: null, classification };
  }

  if (supabaseEnabled() && input.senderId) {
    const existing = await findKnownSender("instagram", input.senderId);

    if (existing) {
      if (classification.extractedPhone && !existing.phone) {
        await updateItemPhone(existing.monday_item_id, classification.extractedPhone);
        await updateSenderPhone("instagram", input.senderId, classification.extractedPhone);
        logger.info(
          { senderId: input.senderId, mondayItemId: existing.monday_item_id },
          "Updated phone on existing lead instead of creating duplicate",
        );
      } else {
        logger.info(
          { senderId: input.senderId, mondayItemId: existing.monday_item_id },
          "Sender already has a CRM row — skipping duplicate creation",
        );
      }
      return { itemId: existing.monday_item_id, classification };
    }
  }

  const name =
    classification.extractedName?.trim() ||
    input.senderUsername ||
    "Unknown IG lead";

  const { itemId } = await createLeadRow({
    name,
    phone: classification.extractedPhone,
    service: classification.service,
    source: "instagram",
  });

  if (supabaseEnabled() && input.senderId) {
    await upsertKnownSender({
      platform: "instagram",
      senderId: input.senderId,
      senderUsername: input.senderUsername,
      mondayItemId: itemId,
      phone: classification.extractedPhone,
    });
  }

  return { itemId, classification };
}
