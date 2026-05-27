import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import {
  findLeadByPhone,
  moveItemToGroup,
  incrementCallsColumn,
  updateLastCallDate,
  addNoteToItem,
} from "../monday/monday.service.js";
import { salestrailClient } from "./salestrail.client.js";
import { transcribeAudio } from "../../lib/transcribe.js";
import type { SalestrailWebhookPayload } from "./calls.validator.js";
import type { CallTestInjectBody } from "./calls.validator.js";

interface CallResult {
  matched: boolean;
  reason?: string;
  itemId?: string;
  phone?: string;
}

export async function handleSalestrailCall(
  payload: SalestrailWebhookPayload,
): Promise<CallResult> {
  const phone = payload.formattedNumber;

  logger.info(
    { callId: payload.callId, phone, sourceDetail: payload.sourceDetail, duration: payload.duration, answered: payload.answered },
    "Processing Salestrail call",
  );

  const lead = await findLeadByPhone(phone);

  if (!lead) {
    logger.info(
      { phone, callId: payload.callId, sourceDetail: payload.sourceDetail },
      "No Monday CRM lead matched — skipping",
    );
    return { matched: false, reason: "no_match", phone };
  }

  let audio: Buffer | null = null;
  try {
    audio = await salestrailClient.downloadRecording(payload.callId);
    if (audio.length === 0) {
      logger.warn({ callId: payload.callId }, "Salestrail returned empty recording");
      audio = null;
    }
  } catch (err) {
    logger.warn(
      { err, callId: payload.callId },
      "Failed to download Salestrail recording — continuing without transcript",
    );
  }

  let summary: string | null = null;
  if (audio) {
    try {
      const result = await transcribeAudio(audio);
      summary = result.summary;
      logger.info(
        { callId: payload.callId, service: result.service_interest, followUp: result.follow_up_needed },
        "Call transcription complete",
      );
    } catch (err) {
      logger.warn(
        { err, callId: payload.callId },
        "Transcription failed — continuing without summary",
      );
    }
  }

  if (!env.MONDAY_GROUP_CONTACTED_ID) {
    throw new AppError(503, "MONDAY_GROUP_CONTACTED_ID not configured", "MONDAY_GROUP_NOT_CONFIGURED");
  }

  await moveItemToGroup(lead.itemId, env.MONDAY_GROUP_CONTACTED_ID);
  await incrementCallsColumn(lead.itemId);
  await updateLastCallDate(env.MONDAY_BOARD_CRM_ID, lead.itemId);

  if (summary) {
    await addNoteToItem(lead.itemId, summary);
  }

  logger.info(
    { itemId: lead.itemId, name: lead.name, phone, hasSummary: !!summary },
    "Salestrail call processed — lead updated",
  );

  return { matched: true, itemId: lead.itemId, phone };
}

export async function handleTestInject(body: CallTestInjectBody): Promise<CallResult> {
  return matchAndUpdate(body.phone);
}

async function matchAndUpdate(phone: string): Promise<CallResult> {
  if (!env.MONDAY_GROUP_CONTACTED_ID) {
    throw new AppError(503, "MONDAY_GROUP_CONTACTED_ID not configured", "MONDAY_GROUP_NOT_CONFIGURED");
  }

  const lead = await findLeadByPhone(phone);

  if (!lead) {
    return { matched: false, reason: "no_match", phone };
  }

  await moveItemToGroup(lead.itemId, env.MONDAY_GROUP_CONTACTED_ID);
  await incrementCallsColumn(lead.itemId);
  await updateLastCallDate(env.MONDAY_BOARD_CRM_ID, lead.itemId);

  logger.info(
    { itemId: lead.itemId, name: lead.name, phone },
    "Test inject — lead updated",
  );

  return { matched: true, itemId: lead.itemId, phone };
}
