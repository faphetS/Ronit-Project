import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  enqueuePendingRecording,
  deletePendingRecording,
  bumpPendingRecording,
  getSetting,
  setSetting,
  type PendingRecording,
} from "../../config/db.js";
import { isMessageProcessed, markMessageProcessed } from "../../lib/dedup.js";
import {
  findLeadByPhone,
  incrementCallsColumn,
  updateLastCallDate,
  addNoteToItem,
} from "../monday/monday.service.js";
import { salestrailClient } from "./salestrail.client.js";
import { transcribeAudio } from "../../lib/transcribe.js";
import type { SalestrailWebhookPayload } from "./calls.validator.js";
import type { CallTestInjectBody } from "./calls.validator.js";

const DEDUP_SOURCE = "salestrail_call";
// Per-Monday-item marker: the call_time of the summary currently shown, so a
// late-arriving older recording can't overwrite a newer call's summary.
const LAST_SUMMARY_KEY = (itemId: string): string => `last_summary_call_time:${itemId}`;

interface CallResult {
  matched: boolean;
  reason?: string;
  itemId?: string;
  phone?: string;
  enqueued?: boolean;
}

/**
 * Synchronous fast path (called from the webhook controller). Resolves the
 * Monday row, updates the call counter + last-call-date exactly once, and
 * enqueues the recording/summary for the background drain. Does NOT download or
 * transcribe — that happens later in processRecordingJob.
 */
export async function handleSalestrailCall(
  payload: SalestrailWebhookPayload,
): Promise<CallResult> {
  const phone = payload.formattedNumber;

  logger.info(
    { callId: payload.callId, phone, sourceDetail: payload.sourceDetail, duration: payload.duration, answered: payload.answered },
    "Processing Salestrail call",
  );

  if (isMessageProcessed(DEDUP_SOURCE, payload.callId)) {
    logger.info({ callId: payload.callId, phone }, "Duplicate Salestrail call — skipping");
    return { matched: false, reason: "duplicate", phone };
  }

  const lead = await findLeadByPhone(phone);

  if (!lead) {
    logger.info(
      { phone, callId: payload.callId, sourceDetail: payload.sourceDetail },
      "No Monday CRM lead matched — skipping",
    );
    return { matched: false, reason: "no_match", phone };
  }

  await incrementCallsColumn(lead.itemId);
  await updateLastCallDate(env.MONDAY_BOARD_CRM_ID, lead.itemId);
  markMessageProcessed(DEDUP_SOURCE, payload.callId);

  let enqueued = false;
  if (payload.answered) {
    enqueuePendingRecording(payload.callId, lead.itemId, payload.startTime);
    enqueued = true;
  }

  logger.info(
    { itemId: lead.itemId, name: lead.name, phone, answered: payload.answered, enqueued },
    "Salestrail call processed — counter updated, summary deferred",
  );

  return { matched: true, itemId: lead.itemId, phone, enqueued };
}

// In-flight guard: the fast checker and catch-up sweep run in the same process
// and can fire at the same instant. They normally process disjoint age ranges,
// but a row exactly on the 3h boundary could be grabbed by both. This set makes
// a given call_id process at most once at a time → no duplicate Gemini call or
// double note write.
const inFlight = new Set<string>();

/**
 * Background job (called by the fast/catch-up crons and the dev test endpoint).
 * Tries a single recording download; on success transcribes and writes the
 * summary note (latest-call-wins), then removes the queue row. On "not
 * ready"/transient error it bumps and leaves the row for a later tick. Final
 * give-up (after 7 days) is handled by expireOldPendingRecordings in the cron.
 */
export async function processRecordingJob(job: PendingRecording): Promise<void> {
  if (inFlight.has(job.call_id)) {
    logger.info({ callId: job.call_id }, "Recording already being processed — skipping");
    return;
  }
  inFlight.add(job.call_id);
  try {
    await runRecordingJob(job);
  } finally {
    inFlight.delete(job.call_id);
  }
}

async function runRecordingJob(job: PendingRecording): Promise<void> {
  const result = await salestrailClient.tryDownloadOnce(job.call_id);

  if (result.status === "not_ready" || result.status === "error") {
    const reason = result.status === "error" ? result.message : "recording not ready";
    bumpPendingRecording(job.id, reason);
    logger.info(
      { callId: job.call_id, attempt: job.attempt_count + 1, status: result.status },
      "Recording not ready yet — will retry",
    );
    return;
  }

  let summary: string;
  let service: string | null;
  let followUp: boolean;
  try {
    const transcription = await transcribeAudio(result.buffer);
    summary = transcription.summary;
    service = transcription.service_interest;
    followUp = transcription.follow_up_needed;
  } catch (err) {
    bumpPendingRecording(job.id, (err as Error).message);
    logger.warn(
      { err, callId: job.call_id, attempt: job.attempt_count + 1 },
      "Transcription failed — will retry",
    );
    return;
  }

  // Latest-call-wins: don't let an older call's late recording overwrite a
  // newer call's summary already shown on the row.
  const thisCallMs = toEpochMs(job.call_time);
  const shownRaw = getSetting(LAST_SUMMARY_KEY(job.item_id));
  const shownMs = shownRaw ? Number(shownRaw) : null;

  if (shownMs !== null && thisCallMs <= shownMs) {
    deletePendingRecording(job.id);
    logger.info(
      { callId: job.call_id, itemId: job.item_id, thisCallMs, shownMs },
      "Older call — not overwriting newer summary",
    );
    return;
  }

  await addNoteToItem(job.item_id, summary);
  setSetting(LAST_SUMMARY_KEY(job.item_id), String(thisCallMs));
  deletePendingRecording(job.id);
  logger.info(
    { callId: job.call_id, itemId: job.item_id, service, followUp },
    "Recording transcribed — summary written to Monday",
  );
}

// Salestrail startTime may be an ISO string or a numeric epoch (ms or s).
export function toEpochMs(startTime: string): number {
  const trimmed = startTime.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return trimmed.length <= 10 ? n * 1000 : n; // 10-digit = seconds
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function handleTestInject(body: CallTestInjectBody): Promise<CallResult> {
  return matchAndUpdate(body.phone);
}

async function matchAndUpdate(phone: string): Promise<CallResult> {
  const lead = await findLeadByPhone(phone);

  if (!lead) {
    return { matched: false, reason: "no_match", phone };
  }

  await incrementCallsColumn(lead.itemId);
  await updateLastCallDate(env.MONDAY_BOARD_CRM_ID, lead.itemId);

  logger.info(
    { itemId: lead.itemId, name: lead.name, phone },
    "Test inject — lead updated",
  );

  return { matched: true, itemId: lead.itemId, phone };
}
