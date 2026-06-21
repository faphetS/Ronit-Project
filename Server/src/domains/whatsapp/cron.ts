import cron from "node-cron";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { runUmanFollowups } from "./uman-followup.service.js";

export function startWhatsAppCrons(): void {
  // Uman WhatsApp follow-up. The job self-guards on WA_FOLLOWUP_ENABLED
  // (default false → no-op) and every send passes the RONIT_WA_ALLOWED_NUMBERS
  // allowlist, so it stays dormant/gated until opened.
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
    `WhatsApp cron jobs scheduled (Uman follow-up "${env.WA_FOLLOWUP_CRON}" [gated by WA_FOLLOWUP_ENABLED]) Asia/Jerusalem`,
  );
}
