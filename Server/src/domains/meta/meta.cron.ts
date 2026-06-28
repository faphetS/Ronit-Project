import cron from "node-cron";
import { logger } from "../../config/logger.js";
import { getCurrentIgToken, getIgTokenExpiry, refreshIgToken } from "./meta.token.service.js";
import { drainCommentQueue } from "./meta.comment.service.js";

const REFRESH_BUFFER_DAYS = 30;
const REFRESH_BUFFER_MS = REFRESH_BUFFER_DAYS * 24 * 60 * 60 * 1000;

export function startMetaCrons(): void {
  // Bootstrap the token file on boot if missing — so the cron has something
  // to track. No-op once the file exists; reads env.IG_ACCESS_TOKEN as seed.
  getCurrentIgToken().catch((err) => {
    logger.warn({ err }, "IG token bootstrap on boot failed — cron will keep retrying");
  });

  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        const expiry = await getIgTokenExpiry();
        if (!expiry) {
          logger.info("IG token file not yet bootstrapped — skipping refresh check");
          return;
        }

        const msUntilExpiry = expiry.getTime() - Date.now();
        if (msUntilExpiry > REFRESH_BUFFER_MS) {
          logger.debug(
            { expiry: expiry.toISOString(), daysLeft: Math.round(msUntilExpiry / 86_400_000) },
            `IG token has >${REFRESH_BUFFER_DAYS}d remaining — skipping refresh`,
          );
          return;
        }

        await refreshIgToken();
      } catch (err) {
        logger.error({ err }, "Cron: IG token refresh failed");
      }
    },
    { timezone: "Asia/Jerusalem" },
  );

  // IG comment Private-Reply queue drainer — paces sends to the hourly cap so a
  // viral post never blasts DMs. No-op when the handler is gated off or the queue
  // is empty.
  cron.schedule(
    "*/1 * * * *",
    () => {
      void drainCommentQueue();
    },
    { timezone: "Asia/Jerusalem" },
  );

  logger.info(`Meta cron jobs scheduled (IG token refresh check daily 03:00 Asia/Jerusalem, refresh when <${REFRESH_BUFFER_DAYS}d remaining; comment-queue drain every 1 min)`);
}
