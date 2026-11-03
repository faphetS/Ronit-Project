/**
 * For tests only: an in-memory Postgres 17 (PGlite, compiled to WebAssembly) with the CRM
 * migrations applied, so SQL is tested against real Postgres without Docker. PGlite is a
 * dev dependency; nothing at runtime imports this file.
 */
import { PGlite, types } from "@electric-sql/pglite";
import type { Db, Queryable } from "../config/pg.js";
import { migrate } from "./migrate.js";
import { ROLE_PERMISSIONS_SEED } from "./migrations/004_role_permissions.js";

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
  /** Empties every CRM table; the birthday_settings, security_settings and role_permissions rows come back at their defaults. */
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
          passports, customer_notes, customers, staff_sign_in_challenges, staff_devices, staff_sessions,
          security_settings, monday_copy_runs, staff_users, leads, monday_notes, monday_boards, role_permissions,
          whatsapp_templates, birthday_settings;
        INSERT INTO security_settings DEFAULT VALUES;
        ${ROLE_PERMISSIONS_SEED}
        INSERT INTO birthday_settings DEFAULT VALUES;
      `);
    },
  };
  await migrate(db);
  return db;
}
