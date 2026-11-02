import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { completeFinishedCampaigns, queueDueCampaigns } from "./holidays.service.js";

// Hanukkah eve, 4 December 2026, 16:00 in Israel.
const NOW = new Date("2026-12-04T14:00:00Z");

let db: TestDb;

async function addCustomer(firstName: string, phone: string | null, optOut = false): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO customers (first_name, last_name, phone, greetings_opt_out) VALUES ($1, 'כהן', $2, $3) RETURNING id",
    [firstName, phone, optOut],
  );
  return rows[0]!.id;
}

async function addCampaign(options: {
  holiday?: string;
  message?: string;
  status?: string;
  sendAt?: Date;
  rate?: [number, number];
  groupIds?: string[];
}): Promise<string> {
  const [messages, everyMinutes] = options.rate ?? [50, 10];
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO campaigns (holiday, hebrew_year, eve, send_at, message, audience_kind, audience_group_ids, rate_messages, rate_every_minutes, status)
     VALUES ($8, 5787, '2026-12-04', $1, $2, $3, $4::uuid[], $5, $6, $7)
     RETURNING id`,
    [
      options.sendAt ?? new Date(NOW.getTime() - 60_000),
      options.message ?? "חג אורים שמח {שם פרטי}",
      options.groupIds ? "groups" : "all",
      options.groupIds ?? [],
      messages,
      everyMinutes,
      options.status ?? "scheduled",
      options.holiday ?? "hanukkah",
    ],
  );
  return rows[0]!.id;
}

async function messages() {
  const { rows } = await db.query<{ body: string; send_at: Date; status: string }>(
    "SELECT body, send_at, status FROM messages ORDER BY send_at, body",
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
});

describe("queueDueCampaigns", () => {
  it("queues one message per recipient, staggered at the campaign's rate", async () => {
    await addCustomer("אביגיל", "972501111111");
    await addCustomer("בתיה", "972502222222");
    await addCustomer("גילה", "972503333333");
    const campaignId = await addCampaign({ rate: [2, 10] });

    expect(await queueDueCampaigns(db, NOW)).toBe(3);

    const queued = await messages();
    expect(queued.map((message) => message.body)).toEqual(["חג אורים שמח אביגיל", "חג אורים שמח בתיה", "חג אורים שמח גילה"]);
    expect(queued.map((message) => message.send_at.toISOString())).toEqual([
      "2026-12-04T14:00:00.000Z",
      "2026-12-04T14:00:00.000Z",
      "2026-12-04T14:10:00.000Z",
    ]);
    const { rows } = await db.query("SELECT status FROM campaigns WHERE id = $1", [campaignId]);
    expect(rows).toEqual([{ status: "sending" }]);
  });

  it("queues a campaign only once", async () => {
    await addCustomer("אביגיל", "972501111111");
    await addCampaign({});
    await queueDueCampaigns(db, NOW);
    expect(await queueDueCampaigns(db, new Date(NOW.getTime() + 60_000))).toBe(0);
  });

  it("leaves a campaign that isn't approved or isn't due yet", async () => {
    await addCustomer("אביגיל", "972501111111");
    await addCampaign({ status: "awaiting-approval" });
    await addCampaign({ holiday: "tuBishvat", sendAt: new Date(NOW.getTime() + 60_000) });
    expect(await queueDueCampaigns(db, NOW)).toBe(0);
  });

  it("sends to the chosen groups only, naming the group", async () => {
    const inGroup = await addCustomer("אביגיל", "972501111111");
    await addCustomer("בתיה", "972502222222");
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO groups (name, kind, starts_on) VALUES ('אומן · חנוכה', 'flight', '2026-12-06') RETURNING id",
    );
    const groupId = rows[0]!.id;
    await db.query("INSERT INTO group_members (group_id, customer_id) VALUES ($1, $2)", [groupId, inGroup]);
    await addCampaign({ groupIds: [groupId], message: "{שם פרטי}, נתראה ב{שם הקבוצה}" });

    expect(await queueDueCampaigns(db, NOW)).toBe(1);
    expect((await messages()).map((message) => message.body)).toEqual(["אביגיל, נתראה באומן · חנוכה"]);
  });

  it("skips customers without a phone or who opted out", async () => {
    await addCustomer("אביגיל", null);
    await addCustomer("בתיה", "972502222222", true);
    await addCampaign({});
    expect(await queueDueCampaigns(db, NOW)).toBe(0);
  });
});

describe("completeFinishedCampaigns", () => {
  it("completes a campaign once nothing is left to send", async () => {
    await addCustomer("אביגיל", "972501111111");
    const campaignId = await addCampaign({});
    await queueDueCampaigns(db, NOW);

    expect(await completeFinishedCampaigns(db, NOW)).toBe(0);
    await db.query("UPDATE messages SET status = 'sent'");
    expect(await completeFinishedCampaigns(db, NOW)).toBe(1);
    const { rows } = await db.query("SELECT status FROM campaigns WHERE id = $1", [campaignId]);
    expect(rows).toEqual([{ status: "completed" }]);
  });
});
