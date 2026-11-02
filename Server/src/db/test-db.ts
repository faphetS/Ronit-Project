/**
 * For tests only: an in-memory Postgres 17 (PGlite, compiled to WebAssembly) with the CRM
 * migrations applied, so SQL is tested against real Postgres without Docker. PGlite is a
 * dev dependency; nothing at runtime imports this file.
 */
import { PGlite, types } from "@electric-sql/pglite";
import type { Db, Queryable } from "../config/pg.js";
import { migrate } from "./migrate.js";

type PgliteLike = Pick<PGlite, "query" | "exec">;

function queryable(pg: PgliteLike): Queryable {
  return {
    async query<R>(text: string, values?: unknown[]) {
      const result = await pg.query<R>(text, values);
      return { rows: result.rows };
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
  };
}

/** Starting PGlite takes a few seconds, more with several test files starting it at once. */
export const TEST_DB_TIMEOUT_MS = 60_000;

export interface TestDb extends Db {
  close(): Promise<void>;
  /** Empties every CRM table (keeps the birthday_settings and security_settings rows, reset to their defaults). */
  reset(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  // DATE as "YYYY-MM-DD", the same as config/pg.ts sets for node-postgres.
  const pglite = await PGlite.create({ parsers: { [types.DATE]: (value: string) => value } });
  const db: TestDb = {
    ...queryable(pglite),
    transaction: (fn) => pglite.transaction((tx) => fn(queryable(tx))),
    close: () => pglite.close(),
    async reset() {
      await pglite.exec(`
        TRUNCATE audit_log, messages, campaigns, passport_intakes, group_members, groups,
          passports, customers, staff_sign_in_challenges, staff_devices, staff_sessions,
          staff_setup_links, security_settings, staff_users;
        INSERT INTO security_settings DEFAULT VALUES;
        UPDATE birthday_settings SET enabled = false, send_time = '09:00',
          shabbat_rule = 'after-shabbat', template = '';
      `);
    },
  };
  await migrate(db);
  return db;
}
