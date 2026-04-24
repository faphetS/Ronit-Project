import { logger } from "../../config/logger.js";
import { classifyLead, type Classification } from "../../lib/classify.js";
import { createLeadRow } from "../monday/monday.service.js";

export async function handleIncomingMessage(input: {
  messageText: string;
  senderUsername?: string;
}): Promise<{ itemId: string | null; classification: Classification }> {
  const classification = await classifyLead(input);

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

  return { itemId, classification };
}
