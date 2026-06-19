import cron from "node-cron";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { checkAndPromptHoliday, broadcastHolidayCampaign } from "./holiday.service.js";
import { runUmanFollowups } from "./uman-followup.service.js";
// checkAndSendFollowups import removed — old GreenAPI follow-up cron disabled (2026-06-04).

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

  // Uman WhatsApp follow-up — daily 10:00. The job self-guards on
  // WA_FOLLOWUP_ENABLED (default false → no-op) and every send passes the
  // RONIT_WA_ALLOWED_NUMBERS allowlist, so it stays dormant/gated until opened.
  // (Replaces the old GreenAPI follow-up cron, removed 2026-06-04.)
  cron.schedule(
    env.WA_FOLLOWUP_CRON,
    async () => {
      try {
        await runUmanFollowups();
      } catch (err) {
        logger.error({ err }, "Cron: Uman follow-up run failed");
      }
    },
    { timezone: "Asia/Jerusalem" },
  );

  logger.info(
    `WhatsApp cron jobs scheduled (holiday check 18:00 [3 days ahead], broadcast 09:00, Uman follow-up "${env.WA_FOLLOWUP_CRON}" [gated by WA_FOLLOWUP_ENABLED]) Asia/Jerusalem`,
  );
}
