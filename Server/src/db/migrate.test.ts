import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { migrate } from "./migrate.js";
import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "./test-db.js";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});

describe("migrate", () => {
  it("creates the CRM tables", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "audit_log",
      "birthday_settings",
      "campaigns",
      "customers",
      "group_members",
      "groups",
      "messages",
      "passport_intakes",
      "passports",
      "schema_migrations",
      "staff_users",
    ]);
  });

  it("applies nothing the second time", async () => {
    expect(await migrate(db)).toEqual([]);
  });

  it("starts with birthdays off and the after-Shabbat rule", async () => {
    const { rows } = await db.query("SELECT enabled, shabbat_rule, send_time::text AS send_time FROM birthday_settings");
    expect(rows).toEqual([{ enabled: false, shabbat_rule: "after-shabbat", send_time: "09:00:00" }]);
  });
});
