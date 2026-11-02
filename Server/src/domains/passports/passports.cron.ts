import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { Db } from "../../config/pg.js";
import { scheduleExclusive } from "../../lib/cron-job.js";
import { intakeDepsFromEnv, retryPendingIntakes } from "./passport.intake.service.js";

export function startPassportCrons(db: Db): void {
  if (!env.PASSPORTS_ENABLED) {
    logger.info("Passport intake retries off (PASSPORTS_ENABLED=false)");
    return;
  }
  const deps = intakeDepsFromEnv(db);
  scheduleExclusive("*/5 * * * *", "passport intake retry", async () => {
    const tried = await retryPendingIntakes(deps);
    if (tried > 0) logger.info({ tried }, "Passport intakes retried");
  });
  logger.info("Passport cron scheduled (retry failed intakes every 5 min) Asia/Jerusalem");
}
