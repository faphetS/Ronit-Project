import { logger } from "../../config/logger.js";
import { classifyLead, type Classification } from "../../lib/classify.js";
import {
  isMessageProcessed,
  markMessageProcessed,
  findKnownSender,
  upsertKnownSender,
  updateSenderPhone,
} from "../../lib/dedup.js";
import {
  createLeadRow,
  updateItemPhone,
  updateLastIgMessage,
} from "../monday/monday.service.js";
import { sendFirstContactDM } from "./meta.outbound.service.js";
import { fetchIgProfile } from "./meta.profile.service.js";

export async function handleIncomingMessage(input: {
  messageText: string;
  senderId?: string;
  senderUsername?: string;
  messageId?: string;
}): Promise<{ itemId: string | null; classification: Classification }> {
  if (input.messageId && isMessageProcessed("meta", input.messageId)) {
    logger.info({ messageId: input.messageId }, "Skipping duplicate webhook message");
    return {
      itemId: null,
      classification: {
        interested: false,
        service: null,
        extractedName: null,
        extractedPhone: null,
        confidence: 0,
        rawResponse: "",
      },
    };
  }

  const classification = await classifyLead(input);

  if (input.messageId) {
    markMessageProcessed("meta", input.messageId);
  }

  // Look up the existing CRM row for this IG sender BEFORE branching on
  // classification — we want to update the lastIgMessage column on every
  // message, interested or not, as long as a row exists for the sender.
  const existing = input.senderId
    ? findKnownSender("instagram", input.senderId)
    : null;

  if (existing) {
    await updateLastIgMessage(existing.monday_item_id, input.messageText);
  }

  if (!classification.interested) {
    logger.info(
      {
        senderUsername: input.senderUsername,
        confidence: classification.confidence,
      },
      "Lead classified as not interested — skipping Monday create/update",
    );
    return { itemId: existing?.monday_item_id ?? null, classification };
  }

  if (existing) {
    if (classification.extractedPhone && !existing.phone) {
      await updateItemPhone(existing.monday_item_id, classification.extractedPhone);
      updateSenderPhone("instagram", input.senderId!, classification.extractedPhone);
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

  // New sender — resolve a display name from the IG profile, fall back to
  // "Unknown IG lead" if the API is unreachable or the user is private.
  let igUsername: string | null = null;
  let displayName = "Unknown IG lead";
  if (input.senderId) {
    const profile = await fetchIgProfile(input.senderId);
    if (profile?.username) {
      igUsername = profile.username;
      displayName = profile.username;
    }
  }

  const { itemId } = await createLeadRow({
    name: displayName,
    phone: classification.extractedPhone,
    service: classification.service,
    source: "instagram",
  });

  if (input.senderId) {
    upsertKnownSender({
      platform: "instagram",
      senderId: input.senderId,
      senderUsername: igUsername ?? input.senderUsername,
      mondayItemId: itemId,
      phone: classification.extractedPhone,
    });
  }

  await updateLastIgMessage(itemId, input.messageText);

  // First-contact auto-reply on Instagram. Only fires on this new-sender path
  // (we got here via createLeadRow). Existing senders return earlier and never
  // reach this point, so we never re-DM known leads.
  if (input.senderId) {
    await sendFirstContactDM(
      input.senderId,
      !!classification.extractedPhone,
      classification.service !== null,
    );
  }

  return { itemId, classification };
}
