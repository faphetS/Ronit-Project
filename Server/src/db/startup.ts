import { logger } from "../config/logger.js";
import { getCrmDb, type Db } from "../config/pg.js";
import { startGreetingsCrons } from "../domains/greetings/greetings.cron.js";
import { startMondayCopy } from "../domains/monday-copy/monday-copy.cron.js";
import { startPassportCrons } from "../domains/passports/passports.cron.js";
import { migrate } from "./migrate.js";

let ready: Promise<Db | null> | null = null;

/**
 * The CRM database once its migrations are applied, or null when DATABASE_URL is not set,
 * the database is down or a migration failed. Never rejects. Migrations run once per process;
 * anything that needs the CRM tables (the crons, sign-in) waits on the same promise.
 */
export function crmDatabase(): Promise<Db | null> {
  ready ??= (async () => {
    const db = getCrmDb();
    if (!db) {
      logger.info("CRM database off — DATABASE_URL not set");
      return null;
    }
    try {
      const applied = await migrate(db);
      logger.info({ applied }, "CRM database ready");
      return db;
    } catch (err) {
      logger.error({ err }, "CRM database unavailable or a migration failed — passports, greetings and sign-in stay off");
      return null;
    }
  })();
  return ready;
}

/**
 * Brings up the CRM database and its automations. Never throws: without the database, the
 * passport and greeting crons simply don't start, and every other flow in the server runs
 * as before.
 */
export async function startCrmAutomations(): Promise<void> {
  const db = await crmDatabase();
  if (!db) return;
  startPassportCrons(db);
  startGreetingsCrons(db);
  startMondayCopy(db);
}
