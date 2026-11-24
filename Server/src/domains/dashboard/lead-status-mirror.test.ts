import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import { ARCHIVE, CRM, fakeAccount, fakeMonday, type FakeMonday } from "../monday-copy/monday-copy.fake.js";
import { copyFromMonday, type CopyDeps } from "../monday-copy/monday-copy.service.js";
import { forgetMondayColumns, labelFor, mirrorStatus, retryPending, RETRY_FAST_MS, RETRY_SLOW_MS, type MirrorDeps } from "./lead-status-mirror.js";

let db: TestDb;
let monday: FakeMonday;
let clock: Date;

const copyDeps = (): CopyDeps => ({ db, gql: monday.gql, boards: { crm: CRM, archive: ARCHIVE }, now: () => clock });
const deps = (): MirrorDeps => ({ db, gql: monday.gql, crmBoardId: CRM, now: () => clock });

async function leadId(itemId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("SELECT id FROM leads WHERE monday_item_id = $1", [itemId]);
  return rows[0].id;
}

/** What a change in the CRM leaves behind: its status, and the label waiting for Monday. */
async function waiting(itemId: string, status: string, label: string): Promise<void> {
  await db.query("UPDATE leads SET status = $2, status_changed_at = $3, monday_label_pending = $4 WHERE monday_item_id = $1", [
    itemId,
    status,
    clock,
    label,
  ]);
}

async function row(itemId: string) {
  const { rows } = await db.query<{
    status: string;
    contact_status: string | null;
    monday_label_pending: string | null;
    monday_sync_attempts: number;
    monday_sync_error: string | null;
    monday_sync_next_at: Date | null;
  }>(
    `SELECT status, contact_status, monday_label_pending, monday_sync_attempts, monday_sync_error, monday_sync_next_at
     FROM leads WHERE monday_item_id = $1`,
    [itemId],
  );
  return rows[0];
}

beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
  forgetMondayColumns();
  clock = new Date("2026-11-24T08:00:00Z");
  monday = fakeMonday(fakeAccount());
  // יעל פרץ (101) is in talks ("נוצר קשר"); שירה כהן (103) is new; רחל לוי (91) is on the old board.
  await copyFromMonday(copyDeps(), "schedule");
  monday.calls.length = 0;
});

describe("labelFor", () => {
  it("gives each status the label the office uses, and clears it for New", () => {
    expect(labelFor("talking")).toBe("נוצר קשר");
    expect(labelFor("no-answer")).toBe("אין מענה");
    expect(labelFor("registered")).toBe("נסגר");
    expect(labelFor("not-relevant")).toBe("לא רלוונטי");
    expect(labelFor("new")).toBe("");
  });
});

describe("mirrorStatus", () => {
  it("sets the label on the lead's Monday row and marks the lead in step", async () => {
    await waiting("101", "no-answer", "אין מענה");
    expect(await mirrorStatus(deps(), await leadId("101"))).toBe("done");
    expect(monday.writes).toEqual([{ boardId: CRM, itemId: "101", columnId: "contact", label: "אין מענה" }]);
    expect(await row("101")).toMatchObject({ status: "no-answer", contact_status: "אין מענה", monday_label_pending: null, monday_sync_attempts: 0 });
  });

  it("clears the label for New", async () => {
    await waiting("101", "new", "");
    expect(await mirrorStatus(deps(), await leadId("101"))).toBe("done");
    expect(monday.writes).toEqual([{ boardId: CRM, itemId: "101", columnId: "contact", label: null }]);
    expect(await row("101")).toMatchObject({ contact_status: null, monday_label_pending: null });
  });

  it("reads the board's columns once per server run", async () => {
    await waiting("101", "no-answer", "אין מענה");
    await mirrorStatus(deps(), await leadId("101"));
    await waiting("103", "talking", "נוצר קשר");
    await mirrorStatus(deps(), await leadId("103"));
    expect(monday.calls).toEqual(["structure", "set-label", "set-label"]);
  });

  it("keeps a newer change made while Monday was answering", async () => {
    await waiting("101", "no-answer", "אין מענה");
    const id = await leadId("101");
    const gql = monday.gql;
    const slow: MirrorDeps = {
      ...deps(),
      gql: (async (query: string, variables?: Record<string, unknown>) => {
        const answer = await gql(query, variables);
        // While Monday takes the first label, someone gives the lead another status.
        if (query.includes("change_column_value")) await waiting("101", "registered", "נסגר");
        return answer;
      }) as MirrorDeps["gql"],
    };
    expect(await mirrorStatus(slow, id)).toBe("done");
    expect(await row("101")).toMatchObject({ status: "registered", monday_label_pending: "נסגר" });
  });

  it("counts a failure and tries again in 2 minutes, then hourly after 30 tries", async () => {
    await waiting("101", "no-answer", "אין מענה");
    const id = await leadId("101");
    monday.fail = new Error("Monday HTTP 500: down");
    expect(await mirrorStatus(deps(), id)).toBe("failed");
    const first = await row("101");
    expect(first).toMatchObject({ monday_label_pending: "אין מענה", monday_sync_attempts: 1, monday_sync_error: "Monday HTTP 500: down" });
    expect(first.monday_sync_next_at?.getTime()).toBe(clock.getTime() + RETRY_FAST_MS);
    await db.query("UPDATE leads SET monday_sync_attempts = 30 WHERE id = $1", [id]);
    await mirrorStatus(deps(), id);
    expect((await row("101")).monday_sync_next_at?.getTime()).toBe(clock.getTime() + RETRY_SLOW_MS);
  });

  it("drops the label of a lead that has left Monday, keeping the reason", async () => {
    await waiting("101", "no-answer", "אין מענה");
    await db.query("UPDATE leads SET removed_at = $2 WHERE monday_item_id = $1", ["101", clock]);
    expect(await mirrorStatus(deps(), await leadId("101"))).toBe("skipped");
    expect(monday.writes).toEqual([]);
    expect(await row("101")).toMatchObject({ monday_label_pending: null, monday_sync_error: "The lead is no longer in Monday" });
  });

  it("does nothing for a lead with no label waiting", async () => {
    expect(await mirrorStatus(deps(), await leadId("101"))).toBe("skipped");
    expect(monday.calls).toEqual([]);
  });
});

describe("retryPending", () => {
  it("sends the labels that are due and leaves the rest for later", async () => {
    await waiting("101", "no-answer", "אין מענה");
    await waiting("103", "talking", "נוצר קשר");
    await db.query("UPDATE leads SET monday_sync_next_at = $2 WHERE monday_item_id = $1", ["103", new Date(clock.getTime() + 60_000)]);
    expect(await retryPending(deps())).toEqual({ done: 1, failed: 0 });
    expect((await row("103")).monday_label_pending).toBe("נוצר קשר");
    clock = new Date(clock.getTime() + 120_000);
    expect(await retryPending(deps())).toEqual({ done: 1, failed: 0 });
    expect((await row("103")).monday_label_pending).toBeNull();
  });

  it("stops at Monday's rate limit", async () => {
    await waiting("101", "no-answer", "אין מענה");
    await waiting("103", "talking", "נוצר קשר");
    monday.fail = new MondayRateLimitError("minute", 30, "limited");
    expect(await retryPending(deps())).toEqual({ done: 0, failed: 1 });
  });
});
