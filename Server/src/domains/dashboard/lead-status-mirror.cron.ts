import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { Db } from "../../config/pg.js";
import { scheduleExclusive } from "../../lib/cron-job.js";
import { gql } from "../monday/monday.client.js";
import { retryPending, type MirrorDeps } from "./lead-status-mirror.js";

/** Every 2 minutes. */
export const MIRROR_SCHEDULE = "*/2 * * * *";

/** The real Monday and the live CRM board. Tests pass a fake instead. */
export function mirrorDepsFromEnv(db: Db): MirrorDeps {
  return { db, gql, crmBoardId: env.MONDAY_BOARD_CRM_ID, now: () => new Date() };
}

/** Sends the status labels still waiting for Monday, every 2 minutes, wherever the Monday copy is on. */
export function startLeadStatusMirror(db: Db, enabled = env.MONDAY_COPY_ENABLED): void {
  if (!enabled) {
    logger.info("Lead status mirror off (MONDAY_COPY_ENABLED=false)");
    return;
  }
  const deps = mirrorDepsFromEnv(db);
  scheduleExclusive(MIRROR_SCHEDULE, "Lead status mirror", async () => {
    const { done, failed } = await retryPending(deps);
    if (done || failed) logger.info({ done, failed }, "Lead status mirror ran");
  });
  logger.info({ schedule: MIRROR_SCHEDULE }, "Lead status mirror scheduled");
}
