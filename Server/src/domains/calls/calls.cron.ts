import cron from "node-cron";
import { logger } from "../../config/logger.js";
import {
  getRecentPendingRecordings,
  getCatchupPendingRecordings,
  expireOldPendingRecordings,
} from "../../config/db.js";
import { processRecordingJob } from "./calls.service.js";
import type { PendingRecording } from "../../config/db.js";

const BATCH_SIZE = 20;

// Separate locks per cron: each guards against its own slow batch being
// re-entered. The two crons process disjoint age ranges, so they never touch
// the same row — and the catch-up sweep is never blocked by the fast checker.
let fastRunning = false;
let sweepRunning = false;

async function processBatch(jobs: PendingRecording[]): Promise<void> {
  for (const job of jobs) {
    try {
      await processRecordingJob(job);
    } catch (err) {
      logger.error({ err, callId: job.call_id }, "Recording job threw unexpectedly");
    }
  }
}

// Fast checker — every minute, rows < 3h old (the normal case).
async function runFastChecker(): Promise<void> {
  if (fastRunning) return;
  fastRunning = true;
  try {
    const jobs = getRecentPendingRecordings(BATCH_SIZE);
    if (jobs.length > 0) {
      logger.info({ count: jobs.length }, "Fast recording checker — processing");
      await processBatch(jobs);
    }
  } finally {
    fastRunning = false;
  }
}

// Catch-up sweep — every 6h, rows 3h–7d old (phone was offline). Also runs the
// 7-day give-up cleanup.
async function runCatchupSweep(): Promise<void> {
  if (sweepRunning) {
    logger.info("Catch-up sweep already running — skipping this tick");
    return;
  }
  sweepRunning = true;
  try {
    const expired = expireOldPendingRecordings();
    for (const callId of expired) {
      logger.warn({ callId }, "Recording never arrived within 7 days — giving up, no summary");
    }
    const jobs = getCatchupPendingRecordings(BATCH_SIZE);
    if (jobs.length > 0) {
      logger.info({ count: jobs.length }, "Catch-up recording sweep — processing");
      await processBatch(jobs);
    }
  } finally {
    sweepRunning = false;
  }
}

export function startCallsCrons(): void {
  cron.schedule(
    "*/1 * * * *",
    () => {
      void runFastChecker();
    },
    { timezone: "Asia/Jerusalem" },
  );

  cron.schedule(
    "0 */6 * * *",
    () => {
      void runCatchupSweep();
    },
    { timezone: "Asia/Jerusalem" },
  );

  logger.info(
    "Calls cron jobs scheduled (fast checker every 1 min, catch-up sweep every 6h Asia/Jerusalem)",
  );
}
