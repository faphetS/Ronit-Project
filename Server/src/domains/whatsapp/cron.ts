import cron from "node-cron";
import { logger } from "../../config/logger.js";
import { checkAndPromptHoliday, broadcastHolidayCampaign } from "./holiday.service.js";
import { checkAndSendFollowups } from "./followup.service.js";

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

  cron.schedule(
    "0 10 * * *",
    async () => {
      try {
        await checkAndSendFollowups();
      } catch (err) {
        logger.error({ err }, "Cron: follow-up check failed");
      }
    },
    { timezone: "Asia/Jerusalem" },
  );

  logger.info("WhatsApp cron jobs scheduled (holiday 18:00, broadcast 09:00, followup 10:00 Asia/Jerusalem)");
}
