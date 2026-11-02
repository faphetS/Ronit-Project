import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { Db } from "../../config/pg.js";
import { scheduleExclusive } from "../../lib/cron-job.js";
import { isAllowed } from "../whatsapp/uman-welcome.service.js";
import { queueBirthdayGreetings } from "./birthdays.service.js";
import { greetingsChannelFromEnv } from "./greetings.channels.js";
import { completeFinishedCampaigns, queueDueCampaigns } from "./holidays.service.js";
import { failInterruptedSends } from "./outbox.repository.js";
import { sendDueMessages, type SenderDeps } from "./outbox.sender.js";

/**
 * One minute's work: queue holiday greetings whose time has come, fail sends a dead run
 * left behind, send what's due, and close campaigns with nothing left.
 */
export async function runGreetingsTick(deps: SenderDeps): Promise<void> {
  const queued = await queueDueCampaigns(deps.db, deps.now());
  const interrupted = await failInterruptedSends(deps.db, deps.now());
  const sends = await sendDueMessages(deps);
  const completed = await completeFinishedCampaigns(deps.db, deps.now());
  if (queued || interrupted || sends.sent || sends.failed || sends.skipped || completed) {
    logger.info({ queued, interrupted, ...sends, completed, channel: deps.channel.name }, "Greetings tick");
  }
}

export function startGreetingsCrons(db: Db): void {
  if (!env.GREETINGS_ENABLED) {
    logger.info("Greetings off (GREETINGS_ENABLED=false)");
    return;
  }
  const deps: SenderDeps = {
    db,
    channel: greetingsChannelFromEnv(),
    isAllowed,
    maxPerRun: env.GREETINGS_MAX_PER_RUN,
    pacingMs: env.GREETINGS_PACING_MS,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };

  scheduleExclusive("* * * * *", "greetings tick", () => runGreetingsTick(deps));
  scheduleExclusive("5 * * * *", "birthday greetings", async () => {
    const queued = await queueBirthdayGreetings(db, new Date());
    if (queued > 0) logger.info({ queued }, "Birthday greetings queued");
  });

  logger.info(
    { channel: deps.channel.name },
    "Greetings crons scheduled (every minute: holiday queue + outbox; hourly at :05: birthdays) Asia/Jerusalem",
  );
}
