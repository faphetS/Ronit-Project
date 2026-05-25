import cron from "node-cron";
import { logger } from "../../config/logger.js";
import { getIgTokenExpiry, refreshIgToken } from "./meta.token.service.js";

const REFRESH_BUFFER_DAYS = 14;
const REFRESH_BUFFER_MS = REFRESH_BUFFER_DAYS * 24 * 60 * 60 * 1000;

export function startMetaCrons(): void {
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
            "IG token has >14d remaining — skipping refresh",
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

  logger.info("Meta cron jobs scheduled (IG token refresh check daily 03:00 Asia/Jerusalem)");
}
