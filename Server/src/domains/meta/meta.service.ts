import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { classifyLead, type Classification } from "../../lib/classify.js";
import {
  isMessageProcessed,
  markMessageProcessed,
  findKnownSender,
  upsertKnownSender,
  updateSenderPhone,
  deleteKnownSenderByItemId,
} from "../../lib/dedup.js";
import {
  createLeadRow,
  updateItemPhone,
  updateLastIgMessage,
  getItemBoardAndGroup,
  moveItemToGroup,
  findLeadOnBoard,
} from "../monday/monday.service.js";
import { getActiveServiceBoardIds } from "../monday/monday.webhook.service.js";
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

  let stalePhone: string | null = null;
  const existing = input.senderId
    ? findKnownSender("instagram", input.senderId)
    : null;

  if (existing) {
    const mondayItemId = existing.monday_item_id;
    const live = await getItemBoardAndGroup(mondayItemId);

    if (live === null || live.boardId !== env.MONDAY_BOARD_CRM_ID) {
      logger.warn(
        { senderId: input.senderId, mondayItemId, liveBoardId: live?.boardId ?? null },
        "Stale known_senders mapping — treating sender as new",
      );
      deleteKnownSenderByItemId(mondayItemId);
      stalePhone = existing.phone;
    } else {
      // Live row on CRM — update last IG message on every message.
      await updateLastIgMessage(mondayItemId, input.messageText);

      if (!classification.interested) {
        logger.info(
          {
            senderUsername: input.senderUsername,
            confidence: classification.confidence,
          },
          "Lead classified as not interested — skipping Monday create/update",
        );
        return { itemId: mondayItemId, classification };
      }

      // Interested + live row — update phone if newly captured.
      if (classification.extractedPhone && !existing.phone) {
        await updateItemPhone(mondayItemId, classification.extractedPhone);
        updateSenderPhone("instagram", input.senderId!, classification.extractedPhone);
        logger.info(
          { senderId: input.senderId, mondayItemId },
          "Updated phone on existing lead instead of creating duplicate",
        );
      } else {
        logger.info(
          { senderId: input.senderId, mondayItemId },
          "Sender already has a CRM row — skipping duplicate creation",
        );
      }

      // Move back to new-leads if the row drifted to another group.
      if (live.groupId !== env.MONDAY_GROUP_NEW_LEADS_ID) {
        await moveItemToGroup(mondayItemId, env.MONDAY_GROUP_NEW_LEADS_ID);
        logger.info(
          { senderId: input.senderId, mondayItemId, fromGroupId: live.groupId },
          "Returning interested lead moved back to new-leads group",
        );
      }

      return { itemId: mondayItemId, classification };
    }
  }

  if (!classification.interested) {
    logger.info(
      {
        senderUsername: input.senderUsername,
        confidence: classification.confidence,
      },
      "Lead classified as not interested — skipping Monday create/update",
    );
    return { itemId: null, classification };
  }

  // New-sender path (existing === null, interested).
  let igUsername: string | null = null;
  let displayName = "Unknown IG lead";
  if (input.senderId) {
    const profile = await fetchIgProfile(input.senderId);
    if (profile?.username) {
      igUsername = profile.username;
      displayName = profile.username;
    }
  }

  // Before creating a CRM row, check whether this lead is already on an active
  // service board (applies when classification named a specific service).
  if (classification.service !== null) {
    const phones = [classification.extractedPhone, stalePhone].filter(
      (p): p is string => !!p,
    );
    const searchName = igUsername ?? input.senderUsername ?? null;

    if (phones.length > 0 || searchName !== null) {
      const boardIds = await getActiveServiceBoardIds(classification.service);
      for (const boardId of boardIds) {
        const hit = await findLeadOnBoard(boardId, phones, searchName);
        if (hit) {
          logger.info(
            {
              senderId: input.senderId,
              boardId,
              serviceItemId: hit.itemId,
              service: classification.service,
            },
            "Lead already on active service board — skipping CRM row creation",
          );
          return { itemId: null, classification };
        }
      }
    }
  }

  const phone = classification.extractedPhone ?? stalePhone;

  const { itemId } = await createLeadRow({
    name: displayName,
    phone,
    service: classification.service,
    source: "instagram",
  });

  if (input.senderId) {
    upsertKnownSender({
      platform: "instagram",
      senderId: input.senderId,
      senderUsername: igUsername ?? input.senderUsername,
      mondayItemId: itemId,
      phone,
    });
  }

  await updateLastIgMessage(itemId, input.messageText);

  if (input.senderId) {
    await sendFirstContactDM(
      input.senderId,
      !!phone,
      classification.service !== null,
    );
  }

  return { itemId, classification };
}
