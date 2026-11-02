import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import { copyFromMonday, copyIfStale, latestRun, nextScheduledCopy, startManualCopy, type CopyDeps } from "./monday-copy.service.js";
import { ARCHIVE, CRM, FLIGHT, fakeAccount, fakeMonday, type FakeMonday } from "./monday-copy.fake.js";

// ---- The tests ----

let db: TestDb;
let clock: Date;
let monday: FakeMonday;

function deps(overrides: Partial<CopyDeps> = {}): CopyDeps {
  return { db, gql: monday.gql, boards: { crm: CRM, archive: ARCHIVE }, now: () => clock, ...overrides };
}

beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
  clock = new Date("2026-11-02T08:00:00Z");
  monday = fakeMonday(fakeAccount());
});

const board = (id: string) => monday.boards.find((b) => b.id === id)!;

async function leads() {
  const { rows } = await db.query<{ monday_item_id: string; name: string; status: string; source: string; archived: boolean; removed: boolean }>(
    "SELECT monday_item_id, name, status, source, archived, removed_at IS NOT NULL AS removed FROM leads ORDER BY monday_item_id",
  );
  return rows;
}

async function members() {
  const { rows } = await db.query<{ trip: string; first_name: string; last_name: string; phone: string | null; note: string | null; monday_status: string | null; monday_passport: string | null; event_on: string | null }>(
    `SELECT g.name AS trip, c.first_name, c.last_name, c.phone, m.note, m.monday_status, m.monday_passport, m.event_on
     FROM group_members m JOIN groups g ON g.id = m.group_id JOIN customers c ON c.id = m.customer_id
     WHERE g.removed_at IS NULL ORDER BY g.name, c.first_name`,
  );
  return rows;
}

describe("copyFromMonday", () => {
  it("copies the leads with a phone, the trips and their people, and Monday's notes", async () => {
    const run = await copyFromMonday(deps(), "schedule");

    expect(run).toMatchObject({ trigger: "schedule", status: "completed", boardsRead: 4, error: null });
    expect(await leads()).toEqual([
      { monday_item_id: "101", name: "יעל פרץ", status: "talking", source: "instagram", archived: false, removed: false },
      { monday_item_id: "103", name: "שירה כהן", status: "new", source: "facebook", archived: false, removed: false },
      { monday_item_id: "91", name: "רחל לוי", status: "talking", source: "landing-page", archived: true, removed: false },
    ]);
    expect(await members()).toEqual([
      { trip: "הפרשות חלה · נובמבר 2026", first_name: "שירה", last_name: "כהן", phone: "972501112233", note: "הפרשת חלה · דימונה", monday_status: null, monday_passport: null, event_on: "2026-11-10" },
      { trip: "טיסה טו באב 26", first_name: "מרים", last_name: "דוק", phone: null, note: null, monday_status: "צוות", monday_passport: null, event_on: null },
      { trip: "טיסה טו באב 26", first_name: "שירה", last_name: "כהן", phone: "972501112233", note: "חדר: לבד", monday_status: "נסגר", monday_passport: "yes", event_on: null },
    ]);
    const { rows: customers } = await db.query<{ first_name: string; source: string; from_monday: boolean }>(
      "SELECT first_name, source, from_monday FROM customers ORDER BY first_name",
    );
    // שירה is on the flight and at a challah evening, and was a Facebook lead: one customer.
    expect(customers).toEqual([
      { first_name: "מרים", source: "monday", from_monday: true },
      { first_name: "שירה", source: "facebook", from_monday: true },
    ]);
    const { rows: notes } = await db.query("SELECT id, monday_item_id, body FROM monday_notes ORDER BY at");
    expect(notes).toEqual([
      { id: "n1", monday_item_id: "101", body: "אין מענה, לחזור מחר" },
      { id: "n2", monday_item_id: "101", body: "שלחתי לה את המסלול" },
    ]);
    expect(run.totals).toEqual({
      itemsFound: 3 + 1 + 2 + 2,
      leads: 2,
      archivedLeads: 1,
      withoutPhone: 1,
      customers: 2,
      groups: 2,
      duplicatesMerged: 1,
      notes: 2,
    });
    // list, structure, rows (CRM 2 pages, archive, flight, challah), notes (CRM, archive)
    expect(monday.calls).toEqual(["list", "structure", "rows", "rows", "rows", "rows", "rows", "notes", "notes"]);
    expect(run.apiCalls).toBe(9);
  });

  it("follows changes: new statuses, a chat that left a phone, rows deleted and people who left", async () => {
    await copyFromMonday(deps(), "schedule");
    clock = new Date("2026-11-02T10:00:00Z");
    const crm = board(CRM);
    crm.rows[0].values.contact = "אין מענה";
    crm.rows[1].values.phone = "0533334444";
    crm.rows.splice(2, 1);
    board(FLIGHT).rows.splice(1, 1);
    crm.notes.unshift({ id: "n3", item_id: "101", created_at: "2026-11-02T09:00:00Z", text_body: "קיבלה פרטים", creator: { name: "Ronit" } });

    await copyFromMonday(deps(), "schedule");

    expect(await leads()).toEqual([
      expect.objectContaining({ monday_item_id: "101", status: "no-answer", removed: false }),
      expect.objectContaining({ monday_item_id: "102", status: "new", source: "instagram", removed: false }),
      expect.objectContaining({ monday_item_id: "103", removed: true }),
      expect.objectContaining({ monday_item_id: "91", archived: true, removed: false }),
    ]);
    // מרים left the flight and has nothing of her own in the dashboard: gone.
    expect((await members()).map((m) => m.first_name)).toEqual(["שירה", "שירה"]);
    expect((await db.query("SELECT count(*)::int AS n FROM customers")).rows[0]).toEqual({ n: 1 });
    // The archive was read 2 hours ago: skipped. The CRM's 2 rows fit one page. The notes stop at the ones already copied.
    expect(monday.calls.slice(9)).toEqual(["list", "structure", "rows", "rows", "rows", "notes"]);
    expect((await db.query("SELECT count(*)::int AS n FROM monday_notes")).rows[0]).toEqual({ n: 3 });
  });

  it("keeps a customer who left Monday when the dashboard has a note on her", async () => {
    await copyFromMonday(deps(), "schedule");
    await db.query("INSERT INTO customer_notes (customer_id, text) SELECT id, 'חדר קרוב למעלית' FROM customers WHERE first_name = 'מרים'");
    board(FLIGHT).rows.splice(1, 1);
    clock = new Date("2026-11-02T10:00:00Z");
    await copyFromMonday(deps(), "schedule");
    expect((await db.query("SELECT first_name FROM customers ORDER BY first_name")).rows).toEqual([{ first_name: "מרים" }, { first_name: "שירה" }]);
  });

  it("hides the leads and trips of a board that's gone from Monday, and brings them back if it returns", async () => {
    await copyFromMonday(deps(), "schedule");
    const flight = board(FLIGHT);
    monday.boards = monday.boards.filter((b) => b.id !== FLIGHT && b.id !== CRM);
    clock = new Date("2026-11-02T10:00:00Z");
    await copyFromMonday(deps(), "schedule");
    expect((await leads()).filter((lead) => !lead.removed).map((lead) => lead.monday_item_id)).toEqual(["91"]);
    expect((await members()).map((m) => m.trip)).toEqual(["הפרשות חלה · נובמבר 2026"]);

    monday.boards.push(flight);
    clock = new Date("2026-11-02T12:00:00Z");
    await copyFromMonday(deps(), "schedule");
    expect((await members()).map((m) => m.trip)).toEqual(["הפרשות חלה · נובמבר 2026", "טיסה טו באב 26", "טיסה טו באב 26"]);
  });

  it("reads the old CRM board again after 20 hours", async () => {
    await copyFromMonday(deps(), "schedule");
    clock = new Date("2026-11-03T05:00:00Z");
    await copyFromMonday(deps(), "schedule");
    expect(monday.calls.slice(9).filter((call) => call === "rows")).toHaveLength(5);
  });

  it("writes nothing and records a skipped copy while Monday is limiting calls", async () => {
    monday.fail = new MondayRateLimitError("daily", 3600, "DAILY_LIMIT_EXCEEDED");
    const run = await copyFromMonday(deps(), "schedule");
    expect(run).toMatchObject({ status: "skipped", totals: null, apiCalls: 1 });
    expect(run.error).toContain("rate limited");
    expect(await leads()).toEqual([]);
  });

  it("stops at its call limit and keeps the previous copy", async () => {
    await copyFromMonday(deps(), "schedule");
    board(CRM).rows[0].name = "שם חדש";
    clock = new Date("2026-11-02T10:00:00Z");
    const run = await copyFromMonday(deps({ maxCalls: 3 }), "schedule");
    expect(run).toMatchObject({ status: "failed", apiCalls: 3 });
    expect(run.error).toContain("limit of 3");
    expect((await leads())[0].name).toBe("יעל פרץ");
    expect((await latestRun(db))?.id).toBe(run.id);
  });
});

describe("startManualCopy", () => {
  it("answers with the run while it copies in the background, and logs who asked", async () => {
    const { rows } = await db.query<{ id: string }>("INSERT INTO staff_users (email, name, role) VALUES ('ronit@example.com', 'רונית', 'admin') RETURNING id");
    const run = await startManualCopy(deps(), rows[0].id);
    expect(run).toMatchObject({ trigger: "manual", status: "running", byUserId: rows[0].id });
    await vi.waitFor(async () => expect((await latestRun(db))?.status).toBe("completed"));
    expect((await db.query("SELECT action, by_user_id FROM audit_log")).rows).toEqual([{ action: "monday-copy", by_user_id: rows[0].id }]);
  });

  it("refuses within 5 minutes of the last copy", async () => {
    await copyFromMonday(deps(), "schedule");
    clock = new Date(clock.getTime() + 4 * 60_000);
    const { rows } = await db.query<{ id: string }>("INSERT INTO staff_users (email, name, role) VALUES ('ronit@example.com', 'רונית', 'admin') RETURNING id");
    await expect(startManualCopy(deps(), rows[0].id)).rejects.toMatchObject({ statusCode: 429, code: "COPY_TOO_SOON" });
  });
});

describe("copyIfStale", () => {
  it("copies at startup only when the last copy is older than 2 hours, and closes runs a restart cut short", async () => {
    await copyFromMonday(deps(), "schedule");
    await db.query("INSERT INTO monday_copy_runs (trigger, started_at) VALUES ('manual', $1)", [clock]);
    clock = new Date(clock.getTime() + 60 * 60_000);
    await copyIfStale(deps());
    expect((await db.query("SELECT status, error FROM monday_copy_runs WHERE trigger = 'manual'")).rows).toEqual([{ status: "failed", error: "interrupted" }]);
    expect((await db.query("SELECT count(*)::int AS n FROM monday_copy_runs")).rows[0]).toEqual({ n: 2 });

    clock = new Date(clock.getTime() + 2 * 60 * 60_000);
    await copyIfStale(deps());
    expect((await latestRun(db))?.trigger).toBe("startup");
  });
});

describe("nextScheduledCopy", () => {
  it("is the next even hour from 07:00 to 23:00 Israel time, then 07:00 the next day", () => {
    // 2026-11-02 is winter time: Israel is UTC+2.
    expect(nextScheduledCopy(new Date("2026-11-02T08:30:00Z")).toISOString()).toBe("2026-11-02T09:00:00.000Z");
    expect(nextScheduledCopy(new Date("2026-11-02T03:00:00Z")).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(nextScheduledCopy(new Date("2026-11-02T21:30:00Z")).toISOString()).toBe("2026-11-03T05:00:00.000Z");
  });
});
