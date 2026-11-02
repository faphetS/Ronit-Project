import { logger } from "../config/logger.js";
import { getCrmDb } from "../config/pg.js";
import { startGreetingsCrons } from "../domains/greetings/greetings.cron.js";
import { startPassportCrons } from "../domains/passports/passports.cron.js";
import { migrate } from "./migrate.js";

/**
 * Brings up the CRM database and its automations. Never throws: without DATABASE_URL, or
 * when the database is down or a migration fails, the passport and greeting crons simply
 * don't start, and every other flow in the server runs as before.
 */
export async function startCrmAutomations(): Promise<void> {
  const db = getCrmDb();
  if (!db) {
    logger.info("CRM automations off — DATABASE_URL not set");
    return;
  }
  try {
    const applied = await migrate(db);
    logger.info({ applied }, "CRM database ready");
  } catch (err) {
    logger.error({ err }, "CRM database unavailable or a migration failed — passport and greeting automations stay off");
    return;
  }
  startPassportCrons(db);
  startGreetingsCrons(db);
}
