import cron from "node-cron";
import { logger } from "../../config/logger.js";
import { checkAndPromptHoliday, broadcastHolidayCampaign } from "./holiday.service.js";
// checkAndSendFollowups import removed — follow-up cron disabled below (2026-06-04).

export function startWhatsAppCrons(): void {
  cron.schedule(
    "0 18 * * *",
    async () => {
      try {
        await checkAndPromptHoliday();
      } catch (err) {
        logger.error({ err }, "Cron: holiday check failed");
      }
    },
    { timezone: "Asia/Jerusalem" },
  );

  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        await broadcastHolidayCampaign();
      } catch (err) {
        logger.error({ err }, "Cron: holiday broadcast failed");
      }
    },
    { timezone: "Asia/Jerusalem" },
  );

  // DISABLED 2026-06-04 — auto follow-up was messaging real clients from the
  // owner's personal WhatsApp number (GreenAPI instance 7107600944). Paused at
  // the owner's request. Re-enable once it sends from a dedicated number.
  // cron.schedule(
  //   "0 10 * * *",
  //   async () => {
  //     try {
  //       await checkAndSendFollowups();
  //     } catch (err) {
  //       logger.error({ err }, "Cron: follow-up check failed");
  //     }
  //   },
  //   { timezone: "Asia/Jerusalem" },
  // );

  logger.info("WhatsApp cron jobs scheduled (holiday check 18:00 [3 days ahead], broadcast 09:00; followup DISABLED) Asia/Jerusalem");
}
