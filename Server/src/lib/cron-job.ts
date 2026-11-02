import cron from "node-cron";
import { logger } from "../config/logger.js";

/**
 * Schedules a job on Israel time that never overlaps itself: a run still going when the
 * next tick fires (a paced send batch, a slow AI call) makes that tick a no-op. A failure
 * is logged and the next tick runs normally.
 */
export function scheduleExclusive(expression: string, label: string, job: () => Promise<void>): void {
  let running = false;
  cron.schedule(
    expression,
    async () => {
      if (running) return;
      running = true;
      try {
        await job();
      } catch (err) {
        logger.error({ err }, `Cron: ${label} failed`);
      } finally {
        running = false;
      }
    },
    { timezone: "Asia/Jerusalem" },
  );
}
