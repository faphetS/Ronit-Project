import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { queueBirthdayGreetings } from "./birthdays.service.js";

// Monday 2 November 2026, 08:00 in Israel (UTC+2). Saturday is 7 November.
const MONDAY_8AM = new Date("2026-11-02T06:00:00Z");

let db: TestDb;

async function customerBornOn(birthDate: string, options: { phone?: string | null; optOut?: boolean } = {}): Promise<string> {
  const phone = options.phone === undefined ? "972501111111" : options.phone;
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO customers (first_name, last_name, phone, greetings_opt_out) VALUES ('שרה', 'כהן', $1, $2) RETURNING id",
    [phone, options.optOut ?? false],
  );
  const id = rows[0]!.id;
  await db.query(
    "INSERT INTO passports (customer_id, number, birth_date, received_via, received_at) VALUES ($1, '31195855', $2, 'whatsapp', now())",
    [id, birthDate],
  );
  return id;
}

async function queuedMessages() {
  const { rows } = await db.query<{ body: string; send_at: Date; to_phone: string; dedup_key: string }>(
    "SELECT body, send_at, to_phone, dedup_key FROM messages ORDER BY send_at",
  );
  return rows;
}

beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
  await db.query("UPDATE birthday_settings SET enabled = true, template = 'מזל טוב {שם פרטי}! {גיל}'");
});

describe("queueBirthdayGreetings", () => {
  it("queues today's birthday at the send time, with the name and the age", async () => {
    const id = await customerBornOn("1990-11-02");

    expect(await queueBirthdayGreetings(db, MONDAY_8AM)).toBe(1);

    const [message] = await queuedMessages();
    expect(message).toMatchObject({ body: "מזל טוב שרה! 36", to_phone: "972501111111", dedup_key: `birthday:${id}:2026` });
    expect(message!.send_at.toISOString()).toBe("2026-11-02T07:00:00.000Z");
  });

  it("queues each greeting once", async () => {
    await customerBornOn("1990-11-02");
    await queueBirthdayGreetings(db, MONDAY_8AM);
    expect(await queueBirthdayGreetings(db, new Date(MONDAY_8AM.getTime() + 3_600_000))).toBe(0);
  });

  it("leaves other days alone, including tomorrow's birthdays", async () => {
    await customerBornOn("1990-11-03");
    await customerBornOn("1990-12-25");
    expect(await queueBirthdayGreetings(db, MONDAY_8AM)).toBe(0);
  });

  it("does nothing while birthdays are off or the template is empty", async () => {
    await customerBornOn("1990-11-02");
    await db.query("UPDATE birthday_settings SET enabled = false");
    expect(await queueBirthdayGreetings(db, MONDAY_8AM)).toBe(0);
    await db.query("UPDATE birthday_settings SET enabled = true, template = '  '");
    expect(await queueBirthdayGreetings(db, MONDAY_8AM)).toBe(0);
  });

  it("sends late the same day when the send time already passed", async () => {
    await customerBornOn("1990-11-02");
    const afternoon = new Date("2026-11-02T12:00:00Z");
    await queueBirthdayGreetings(db, afternoon);
    expect((await queuedMessages())[0]!.send_at.toISOString()).toBe(afternoon.toISOString());
  });

  it("waits until Shabbat is out under the after-Shabbat rule", async () => {
    await customerBornOn("1985-11-07");
    await queueBirthdayGreetings(db, new Date("2026-11-07T06:00:00Z"));
    expect((await queuedMessages())[0]!.send_at.toISOString()).toBe("2026-11-07T19:00:00.000Z");
  });

  it("sends a Saturday birthday on Friday under the before-Shabbat rule, once", async () => {
    await db.query("UPDATE birthday_settings SET shabbat_rule = 'before-shabbat'");
    await customerBornOn("1985-11-07");

    expect(await queueBirthdayGreetings(db, new Date("2026-11-06T06:00:00Z"))).toBe(1);
    expect((await queuedMessages())[0]!.send_at.toISOString()).toBe("2026-11-06T07:00:00.000Z");
    expect(await queueBirthdayGreetings(db, new Date("2026-11-07T06:00:00Z"))).toBe(0);
  });

  it("never sends a missed Friday greeting on Shabbat", async () => {
    await db.query("UPDATE birthday_settings SET shabbat_rule = 'before-shabbat'");
    await customerBornOn("1985-11-07");
    expect(await queueBirthdayGreetings(db, new Date("2026-11-07T06:00:00Z"))).toBe(0);
  });

  it("skips customers who opted out or have no phone", async () => {
    await customerBornOn("1990-11-02", { optOut: true });
    await customerBornOn("1990-11-02", { phone: null });
    expect(await queueBirthdayGreetings(db, MONDAY_8AM)).toBe(0);
  });

  it("greets a 29 February birthday on the 28th", async () => {
    await customerBornOn("2004-02-29");
    expect(await queueBirthdayGreetings(db, new Date("2026-02-28T06:00:00Z"))).toBe(1);
  });
});
