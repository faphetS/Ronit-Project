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
      "customer_notes",
      "customers",
      "group_members",
      "groups",
      "leads",
      "messages",
      "monday_boards",
      "monday_copy_runs",
      "monday_notes",
      "passport_intakes",
      "passports",
      "role_permissions",
      "schema_migrations",
      "security_settings",
      "staff_devices",
      "staff_sessions",
      "staff_sign_in_challenges",
      "staff_users",
    ]);
  });

  it("applies nothing the second time", async () => {
    expect(await migrate(db)).toEqual([]);
  });

  it("starts with every security switch on and a 30-minute automatic sign-out", async () => {
    const { rows } = await db.query("SELECT two_step_required, mask_passport_numbers, auto_sign_out, auto_sign_out_minutes, passport_access_log FROM security_settings");
    expect(rows).toEqual([
      { two_step_required: true, mask_passport_numbers: true, auto_sign_out: true, auto_sign_out_minutes: 30, passport_access_log: true },
    ]);
  });

  it("keeps staff emails lowercase", async () => {
    await expect(db.query("INSERT INTO staff_users (email, name, role) VALUES ('Ronit@Example.com', 'רונית', 'admin')")).rejects.toThrow();
  });

  it("starts with birthdays off and the after-Shabbat rule", async () => {
    const { rows } = await db.query("SELECT enabled, shabbat_rule, send_time::text AS send_time FROM birthday_settings");
    expect(rows).toEqual([{ enabled: false, shabbat_rule: "after-shabbat", send_time: "09:00:00" }]);
  });
});
