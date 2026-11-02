import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { Db } from "../../config/pg.js";
import { scheduleExclusive } from "../../lib/cron-job.js";
import { gql } from "../monday/monday.client.js";
import { COPY_SCHEDULE, copyFromMonday, copyIfStale, type CopyDeps } from "./monday-copy.service.js";

/** The copy's dependencies on this server: the CRM database and Monday through monday.client.ts. */
export function copyDepsFromEnv(db: Db): CopyDeps {
  return {
    db,
    gql,
    boards: { crm: env.MONDAY_BOARD_CRM_ID, archive: env.MONDAY_BOARD_CRM_ARCHIVE_ID },
    now: () => new Date(),
  };
}

/** Copies Monday every 2 hours from 07:00 to 23:00 Israel time, and at startup when the last copy is stale. */
export function startMondayCopy(db: Db): void {
  if (!env.MONDAY_COPY_ENABLED) {
    logger.info("Monday copy off (MONDAY_COPY_ENABLED=false)");
    return;
  }
  const deps = copyDepsFromEnv(db);
  scheduleExclusive(COPY_SCHEDULE, "Monday copy", async () => {
    await copyFromMonday(deps, "schedule");
  });
  void copyIfStale(deps).catch((err: unknown) => logger.error({ err }, "Monday copy at startup failed"));
  logger.info({ schedule: COPY_SCHEDULE }, "Monday copy scheduled (Asia/Jerusalem)");
}
