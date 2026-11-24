# Lead status in the CRM, kept in step with Monday: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ronit's team changes a lead's status in the CRM, by dragging its card on the leads board or with a status menu.
The CRM saves the change first and then sets Monday's "נוצר קשר" label, retrying until Monday accepts. A press
outside the open lead's side panel closes it.

**Architecture:**
- **Server:** a new route saves the status in Postgres, logs who changed it, and marks the label as waiting for Monday.
  - A small mirror unit writes the label through the existing Monday client, right away and again from a 2-minute
    retry job.
  - The 2-hourly Monday copy stops overwriting a status the CRM changed: it only takes Monday's status when the group
    or label changed in Monday.
- **Dashboard:**
  - the board uses `@dnd-kit/core` for drag and drop, and an optimistic React Query mutation;
  - the lead's header gets a native-select status menu;
  - a small hook closes the side panel on outside presses.

**Tech stack:**
- **Server:** Node + Express 5 + TypeScript (ESM, `.js` import suffixes), Postgres (PGlite in tests), Vitest +
  supertest.
- **Dashboard:** React 19, React Router 8, TanStack Query 5, Motion 14, Tailwind 4, Vitest + Testing Library (jsdom),
  `@dnd-kit/core` 6.3.1.

**Spec:** `docs/superpowers/specs/2026-11-24-lead-status-crm-first-design.md`

## Global constraints

- **The route:** `POST /api/dashboard/leads/:id/status`, body `{ status: "new" | "talking" | "no-answer" | "registered" | "not-relevant" }`,
  `requireAccess("leads", "full")`.
- **The labels on Monday's "נוצר קשר" column:**

  | Status | Label |
  |---|---|
  | `talking` | נוצר קשר |
  | `no-answer` | אין מענה |
  | `registered` | נסגר |
  | `not-relevant` | לא רלוונטי |
  | `new` | cleared, by writing `{}` |

- **Labels are never created.** Leads are never moved between Monday groups. Nothing is written to the Google Sheets.
- **The CRM's change always stands.** The route waits at most 4 seconds for Monday, then answers anyway.
- **Only leads on the live CRM board (`MONDAY_BOARD_CRM_ID`) get a label for Monday.** Old-board leads change in the CRM
  only.
- **Retries:**
  - a cron job every 2 minutes (`*/2 * * * *`), at most 20 due leads per run, oldest first;
  - after a failure, the next try is in 2 minutes for the first 30 attempts, then 1 hour;
  - a Monday rate limit ends the run.
- **The migration id is `009_lead_status_in_crm`.** Never rename it. The local `feat/passport-bot` branch's migration
  becomes 010.
- **Logs carry a lead's id, never its phone.** Test data is made up: no real names or numbers.
- **Every new dashboard string goes into both** `dashboard/src/content/leads.he.ts` and `leads.en.ts`. The English
  file is typed `Widen<typeof he>`, so a missing key fails the typecheck.
- **`@dnd-kit/core` is pinned at exactly `6.3.1`.** It's the only new package.
- **Commits** use this repo's conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`) and end with the trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Where to work:**
  - The worktree is `D:\work\Ronit-Project-lead-status` (branch `feat/lead-status-drag`). In Git Bash it's
    `/d/work/Ronit-Project-lead-status`.
  - Never work in `D:\work\Ronit-Project`, which holds the user's passport-bot work.

---

### Task 1: Lead status columns in the database, and `mondayPending` on the lead

**Files:**
- Create: `Server/src/db/migrations/009_lead_status_in_crm.ts`
- Modify: `Server/src/db/migrations/index.ts`
- Modify: `Server/src/domains/dashboard/leads.service.ts`
- Test: `Server/src/domains/dashboard/dashboard.routes.test.ts`

**Interfaces:**
- Produces:
  - new `leads` columns: `status_changed_at timestamptz`, `status_changed_by uuid`, `monday_label_pending text`,
    `monday_sync_attempts integer NOT NULL DEFAULT 0`, `monday_sync_error text`, `monday_sync_next_at timestamptz`;
  - `LeadDto.mondayPending: boolean`.

- [ ] **Step 1: Install the server's packages in the worktree**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npm ci`
Expected: it finishes without errors and creates `node_modules`.

- [ ] **Step 2: Write the failing test**

In `Server/src/domains/dashboard/dashboard.routes.test.ts`, test "lists the open pipeline, counts it, and opens a lead
with its Monday notes", add `mondayPending: false` to the `toMatchObject` for `list[1]`:

```ts
    expect(list[1]).toMatchObject({
      phone: "0542212219",
      status: "talking",
      source: "instagram",
      service: "uman",
      mondayGroup: "לידים חדשים אורטל",
      mondayBoard: "רונית  - CRM",
      mondayUrl: "https://ronit550418.monday.com/boards/5101856136/pulses/101",
      lastNote: "שלחתי לה את המסלול",
      archived: false,
      mondayPending: false,
      history: [],
    });
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/dashboard.routes.test.ts -t "lists the open pipeline"`
Expected: FAIL. The received object has no `mondayPending`.

- [ ] **Step 4: Add the migration**

Create `Server/src/db/migrations/009_lead_status_in_crm.ts`:

```ts
/**
 * A lead's status can change in the CRM (spec 2026-11-24): when and by whom, and the "נוצר קשר" label still on its
 * way to Monday, with the tries so far and when to try next. Monday's own edits keep arriving with the 2-hourly copy.
 */
export const LEAD_STATUS_IN_CRM = `
ALTER TABLE leads
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN status_changed_by uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  ADD COLUMN monday_label_pending text,
  ADD COLUMN monday_sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN monday_sync_error text,
  ADD COLUMN monday_sync_next_at timestamptz;
CREATE INDEX leads_monday_pending_idx ON leads (monday_sync_next_at) WHERE monday_label_pending IS NOT NULL;
`;
```

In `Server/src/db/migrations/index.ts`, add the import after the `DEMO_ACCOUNTS` import:

```ts
import { LEAD_STATUS_IN_CRM } from "./009_lead_status_in_crm.js";
```

Then add the last entry of `MIGRATIONS`, after `{ id: "008_demo_accounts", sql: DEMO_ACCOUNTS },`:

```ts
  { id: "009_lead_status_in_crm", sql: LEAD_STATUS_IN_CRM },
```

- [ ] **Step 5: Send `mondayPending` with every lead**

In `Server/src/domains/dashboard/leads.service.ts`:

1. Replace the first line's comment with:

```ts
/** Leads, as copied from Monday's CRM boards. Their status can also change in the CRM: see lead-status.service.ts. */
```

2. In `interface LeadDto`, after `nextStep: string | null;`, add:

```ts
  /** A status changed in the CRM whose label hasn't reached Monday yet. */
  mondayPending: boolean;
```

3. In `interface LeadRow`, after `last_note: string | null;`, add:

```ts
  monday_label_pending: string | null;
```

4. Replace `LEAD_SELECT` with:

```ts
const LEAD_SELECT = `
  SELECT l.id, l.monday_item_id, l.monday_board_id, l.monday_group, b.name AS board_name, l.name, l.phone, l.source,
         l.status, l.service, l.calls, l.last_call_on, l.inquiry_on, l.last_message, l.next_step, l.archived,
         l.created_at, l.updated_at, l.monday_label_pending,
         (SELECT n.body FROM monday_notes n WHERE n.monday_item_id = l.monday_item_id ORDER BY n.at DESC LIMIT 1) AS last_note
  FROM leads l LEFT JOIN monday_boards b ON b.id = l.monday_board_id`;
```

5. In `toLead`, after `nextStep: row.next_step,`, add:

```ts
    mondayPending: row.monday_label_pending !== null,
```

- [ ] **Step 6: Run the test to see it pass**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/dashboard.routes.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 7: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add Server/src/db/migrations/009_lead_status_in_crm.ts Server/src/db/migrations/index.ts Server/src/domains/dashboard/leads.service.ts Server/src/domains/dashboard/dashboard.routes.test.ts
git commit -m "feat: lead status columns, and mondayPending on every lead" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The mirror, which writes a waiting label to Monday

**Files:**
- Modify: `Server/src/domains/monday-copy/monday-copy.fake.ts` (the fake Monday learns `change_column_value`)
- Create: `Server/src/domains/dashboard/lead-status-mirror.ts`
- Test: `Server/src/domains/dashboard/lead-status-mirror.test.ts`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces, from `lead-status-mirror.ts`:
  - `SETTABLE_STATUSES` (`readonly ["new","talking","no-answer","registered","not-relevant"]`), and
    `type SettableStatus`;
  - `labelFor(status: SettableStatus): string`, which returns `""` for `new`;
  - `interface MirrorDeps { db: Queryable; gql: Gql; crmBoardId: string; now: () => Date }`;
  - `type MirrorResult = "done" | "failed" | "rate-limited" | "skipped"`;
  - `mirrorStatus(deps, leadId): Promise<MirrorResult>`;
  - `retryPending(deps, limit = 20): Promise<{ done: number; failed: number }>`;
  - `mirrorSoon(deps, leadId, waitMs = 4000): Promise<void>`, which never throws;
  - `forgetMondayColumns(): void`, for tests;
  - `FAST_ATTEMPTS = 30`, `RETRY_FAST_MS = 120000` and `RETRY_SLOW_MS = 3600000`.
- Produces, on `FakeMonday`: `writes: Array<{ boardId: string; itemId: string; columnId: string; label: string | null }>`
  and the call name `"set-label"`.

- [ ] **Step 1: Teach the fake Monday to set a label**

In `Server/src/domains/monday-copy/monday-copy.fake.ts`:

1. In `interface FakeMonday`, after `calls: string[];`, add:

```ts
  /** Labels set with change_column_value (the lead status mirror), oldest first. null: cleared. */
  writes: Array<{ boardId: string; itemId: string; columnId: string; label: string | null }>;
```

2. In `fakeMonday`, replace `const fake: FakeMonday = { boards, calls: [], gql: undefined as unknown as Gql };` with:

```ts
  const fake: FakeMonday = { boards, calls: [], writes: [], gql: undefined as unknown as Gql };
```

3. In `fake.gql`, right after the line `const find = (id: unknown) => fake.boards.find((board) => board.id === String(id));`,
   add:

```ts
    if (query.includes("change_column_value")) {
      fake.calls.push("set-label");
      const row = find(variables.boardId)?.rows.find((candidate) => candidate.id === String(variables.itemId));
      if (!row) throw new Error(`Monday GraphQL error: item ${String(variables.itemId)} not found`);
      const label = (JSON.parse(String(variables.value)) as { label?: string }).label ?? null;
      row.values[String(variables.columnId)] = label ?? "";
      fake.writes.push({ boardId: String(variables.boardId), itemId: row.id, columnId: String(variables.columnId), label });
      return { change_column_value: { id: row.id } };
    }
```

4. Replace the comment above `export function fakeMonday` with:

```ts
/** Answers the reader's five queries from `boards`, 2 rows and 1 note per page to exercise paging, and the lead status mirror's label writes. */
```

- [ ] **Step 2: Write the failing tests**

Create `Server/src/domains/dashboard/lead-status-mirror.test.ts`:

```ts
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
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/lead-status-mirror.test.ts`
Expected: FAIL. The module `./lead-status-mirror.js` can't be resolved.

- [ ] **Step 4: Write the mirror**

Create `Server/src/domains/dashboard/lead-status-mirror.ts`:

```ts
import { logger } from "../../config/logger.js";
import type { Queryable } from "../../config/pg.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import type { Gql } from "../monday-copy/monday-copy.reader.js";

/**
 * Keeps Monday in step with a status changed in the CRM, through the lead's "נוצר קשר" label: the one the office
 * sets by hand. The CRM's change already stands; this only tells Monday, and keeps trying until Monday takes it.
 * It never moves a lead between Monday groups, and never creates a label.
 * Spec: docs/superpowers/specs/2026-11-24-lead-status-crm-first-design.md
 */

/** The statuses a person can give a lead. "details-sent" stays Monday's own, shown under In progress. */
export const SETTABLE_STATUSES = ["new", "talking", "no-answer", "registered", "not-relevant"] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

const LABELS: Record<SettableStatus, string> = {
  new: "",
  talking: "נוצר קשר",
  "no-answer": "אין מענה",
  registered: "נסגר",
  "not-relevant": "לא רלוונטי",
};

/** Monday's "נוצר קשר" label for a status; empty for New, which clears the label. */
export function labelFor(status: SettableStatus): string {
  return LABELS[status];
}

export interface MirrorDeps {
  db: Queryable;
  gql: Gql;
  /** The live CRM board. Only its leads are kept in step: the old board changes in the CRM only. */
  crmBoardId: string;
  now: () => Date;
}

export type MirrorResult = "done" | "failed" | "rate-limited" | "skipped";

/** After a failure: the next try in 2 minutes for the first 30 tries (about an hour), then hourly. */
export const FAST_ATTEMPTS = 30;
export const RETRY_FAST_MS = 2 * 60_000;
export const RETRY_SLOW_MS = 60 * 60_000;

const CONTACT_COLUMN = "נוצר קשר";

/** The "נוצר קשר" column's id on each board, read once per server run. Found by title, like the copy does. */
const contactColumns = new Map<string, string>();

/** For tests: forget the column ids read from Monday. */
export function forgetMondayColumns(): void {
  contactColumns.clear();
}

async function contactColumn(deps: MirrorDeps, boardId: string): Promise<string> {
  const known = contactColumns.get(boardId);
  if (known) return known;
  const data = await deps.gql<{ boards: Array<{ columns: Array<{ id: string; title: string }> }> }>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { id columns { id title } } }`,
    { ids: [boardId] },
  );
  const column = data.boards[0]?.columns.find((candidate) => candidate.title.trim() === CONTACT_COLUMN);
  if (!column) throw new Error(`Board ${boardId} has no "${CONTACT_COLUMN}" column`);
  contactColumns.set(boardId, column.id);
  return column.id;
}

const SET_LABEL = `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
  change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
}`;

interface WaitingLead {
  monday_item_id: string;
  monday_board_id: string;
  monday_label_pending: string | null;
  monday_sync_attempts: number;
  removed_at: Date | null;
}

/**
 * Writes a lead's waiting label to Monday, once. On success the lead is in step, unless a newer change arrived
 * meanwhile: that one stays waiting. On failure the try is counted and the next one scheduled.
 */
export async function mirrorStatus(deps: MirrorDeps, leadId: string): Promise<MirrorResult> {
  const { rows } = await deps.db.query<WaitingLead>(
    "SELECT monday_item_id, monday_board_id, monday_label_pending, monday_sync_attempts, removed_at FROM leads WHERE id = $1",
    [leadId],
  );
  const lead = rows[0];
  if (!lead || lead.monday_label_pending === null) return "skipped";
  const label = lead.monday_label_pending;

  if (lead.removed_at) {
    // The copy found the row gone from Monday (deleted, or closed into a trip): nothing is left to update.
    await deps.db.query(
      "UPDATE leads SET monday_label_pending = NULL, monday_sync_next_at = NULL, monday_sync_error = $3 WHERE id = $1 AND monday_label_pending = $2",
      [leadId, label, "The lead is no longer in Monday"],
    );
    return "skipped";
  }

  try {
    const columnId = await contactColumn(deps, lead.monday_board_id);
    await deps.gql(SET_LABEL, {
      boardId: lead.monday_board_id,
      itemId: lead.monday_item_id,
      columnId,
      value: JSON.stringify(label ? { label } : {}),
    });
  } catch (err) {
    const attempts = lead.monday_sync_attempts + 1;
    const wait = attempts <= FAST_ATTEMPTS ? RETRY_FAST_MS : RETRY_SLOW_MS;
    const message = err instanceof Error ? err.message.slice(0, 300) : "Monday didn't take the label";
    await deps.db.query(
      "UPDATE leads SET monday_sync_attempts = $3, monday_sync_error = $4, monday_sync_next_at = $5 WHERE id = $1 AND monday_label_pending = $2",
      [leadId, label, attempts, message, new Date(deps.now().getTime() + wait)],
    );
    logger.warn({ leadId, attempts, err }, "Lead status not in Monday yet");
    return err instanceof MondayRateLimitError ? "rate-limited" : "failed";
  }

  await deps.db.query(
    `UPDATE leads SET monday_label_pending = NULL, contact_status = $3, monday_sync_attempts = 0, monday_sync_error = NULL,
       monday_sync_next_at = NULL
     WHERE id = $1 AND monday_label_pending = $2`,
    [leadId, label, label || null],
  );
  return "done";
}

/** The retry job's run: up to `limit` waiting leads that are due, oldest first. A rate limit ends the run. */
export async function retryPending(deps: MirrorDeps, limit = 20): Promise<{ done: number; failed: number }> {
  const { rows } = await deps.db.query<{ id: string }>(
    `SELECT id FROM leads
     WHERE monday_label_pending IS NOT NULL AND (monday_sync_next_at IS NULL OR monday_sync_next_at <= $1)
     ORDER BY monday_sync_next_at NULLS FIRST, status_changed_at
     LIMIT $2`,
    [deps.now(), limit],
  );
  const tally = { done: 0, failed: 0 };
  for (const { id } of rows) {
    const result = await mirrorStatus(deps, id);
    if (result === "done") tally.done += 1;
    if (result === "failed" || result === "rate-limited") tally.failed += 1;
    if (result === "rate-limited") break;
  }
  return tally;
}

/** Tells Monday right after a change, waiting at most `waitMs`. A slower Monday carries on in the background. Never throws. */
export async function mirrorSoon(deps: MirrorDeps, leadId: string, waitMs = 4000): Promise<void> {
  const attempt = mirrorStatus(deps, leadId).catch((err: unknown) => {
    logger.error({ err, leadId }, "Lead status mirror failed");
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  await Promise.race([attempt, timeout]);
  clearTimeout(timer);
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/lead-status-mirror.test.ts src/domains/monday-copy`
Expected: PASS. That's the new file plus the copy's own tests, which use the changed fake.

- [ ] **Step 6: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add Server/src/domains/monday-copy/monday-copy.fake.ts Server/src/domains/dashboard/lead-status-mirror.ts Server/src/domains/dashboard/lead-status-mirror.test.ts
git commit -m "feat: write a lead's waiting status label to Monday, with retries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Setting a status: `POST /api/dashboard/leads/:id/status`

**Files:**
- Create: `Server/src/domains/dashboard/lead-status.service.ts`
- Create: `Server/src/domains/dashboard/lead-status-mirror.cron.ts` (only `mirrorDepsFromEnv` for now)
- Modify: `Server/src/domains/dashboard/dashboard.validator.ts`
- Modify: `Server/src/domains/dashboard/dashboard.routes.ts`
- Test: `Server/src/domains/dashboard/dashboard.routes.test.ts`

**Interfaces:**
- Consumes, from Task 2: `SETTABLE_STATUSES`, `SettableStatus`, `labelFor`, `MirrorDeps`, `mirrorSoon` and
  `forgetMondayColumns`. From Task 1: `LeadDto.mondayPending`.
- Produces:
  - `setLeadStatus(db: Db, crmBoardId: string, change: StatusChange, now: Date): Promise<"changed" | "unchanged">`;
  - `interface StatusChange { leadId: string; status: SettableStatus; byUserId: string }`;
  - `LeadStatusSchema`;
  - `mirrorDepsFromEnv(db: Db): MirrorDeps`;
  - `DashboardOptions.mirror?: { enabled: boolean; deps: (db: Db) => MirrorDeps }`;
  - an `audit_log` row with action `lead-status-changed` and details `{ leadId, from, to }`.

- [ ] **Step 1: Write the failing tests**

In `Server/src/domains/dashboard/dashboard.routes.test.ts`:

1. Add this import after the `createDashboardRouter` import:

```ts
import { forgetMondayColumns, type MirrorDeps } from "./lead-status-mirror.js";
```

2. After `const copyDeps = ...`, add:

```ts
const mirrorDeps = (): MirrorDeps => ({ db, gql: monday.gql, crmBoardId: CRM, now: () => clock });
```

3. Change `app`'s default options to:

```ts
function app(options: DashboardOptions = { copy: { enabled: true, deps: copyDeps }, mirror: { enabled: true, deps: mirrorDeps } }) {
```

4. Add this `describe` after the existing `describe("leads", ...)` block:

```ts
describe("changing a lead's status", () => {
  const leadIdOf = async (itemId: string) => (await db.query<{ id: string }>("SELECT id FROM leads WHERE monday_item_id = $1", [itemId])).rows[0].id;
  const statusLog = async () =>
    (await db.query<{ by_user_id: string; details: Record<string, string> }>("SELECT by_user_id, details FROM audit_log WHERE action = 'lead-status-changed'")).rows;

  beforeEach(() => {
    forgetMondayColumns();
  });

  it("saves it in the CRM, logs who changed it, and sets the label in Monday", async () => {
    const id = await leadIdOf("101");
    const lead = (await post(moran, `/leads/${id}/status`, { status: "no-answer" }).expect(200)).body.data;
    expect(lead).toMatchObject({ id, status: "no-answer", mondayPending: false });
    expect(monday.writes).toEqual([{ boardId: CRM, itemId: "101", columnId: "contact", label: "אין מענה" }]);
    expect(await statusLog()).toEqual([{ by_user_id: moran.id, details: { leadId: id, from: "talking", to: "no-answer" } }]);
    expect((await get(moran, "/leads/counts").expect(200)).body.data).toMatchObject({ talking: 0, "no-answer": 1 });
  });

  it("keeps the change when Monday is down, and says the label is waiting", async () => {
    const id = await leadIdOf("101");
    monday.fail = new Error("Monday HTTP 500: down");
    const lead = (await post(moran, `/leads/${id}/status`, { status: "not-relevant" }).expect(200)).body.data;
    expect(lead).toMatchObject({ status: "not-relevant", mondayPending: true });
  });

  it("changes old-board leads in the CRM only", async () => {
    const id = await leadIdOf("91");
    const lead = (await post(moran, `/leads/${id}/status`, { status: "registered" }).expect(200)).body.data;
    expect(lead).toMatchObject({ status: "registered", mondayPending: false });
    expect(monday.writes).toEqual([]);
  });

  it("does nothing when the lead already has that status", async () => {
    const id = await leadIdOf("103");
    await post(moran, `/leads/${id}/status`, { status: "new" }).expect(200);
    expect(monday.writes).toEqual([]);
    expect(await statusLog()).toEqual([]);
  });

  it("needs full access to leads, a known status, and a lead still in Monday", async () => {
    const id = await leadIdOf("101");
    await post(ronit, "/users/permissions", { role: "sales", area: "leads", access: "view" }).expect(200);
    expect((await post(moran, `/leads/${id}/status`, { status: "new" }).expect(403)).body.code).toBe("NO_ACCESS");
    await post(shira, `/leads/${id}/status`, { status: "details-sent" }).expect(400);
    await post(shira, `/leads/${id}/status`, {}).expect(400);
    await post(shira, "/leads/not-a-uuid/status", { status: "new" }).expect(404);
    await db.query("UPDATE leads SET removed_at = $2 WHERE id = $1", [id, clock]);
    await post(shira, `/leads/${id}/status`, { status: "new" }).expect(404);
    await db.query("UPDATE staff_users SET is_demo = true WHERE id = $1", [shira.id]);
    expect((await post(shira, `/leads/${id}/status`, { status: "new" }).expect(403)).body.code).toBe("DEMO_ACCOUNT");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/dashboard.routes.test.ts -t "changing a lead's status"`
Expected: FAIL. The typecheck in Vitest complains that `mirror` isn't in `DashboardOptions`, or the route answers 404.

- [ ] **Step 3: Write the service**

Create `Server/src/domains/dashboard/lead-status.service.ts`:

```ts
import type { Db } from "../../config/pg.js";
import { NotFoundError } from "../../lib/errors.js";
import type { LeadStatus } from "../monday-copy/monday-copy.mapping.js";
import { labelFor, type SettableStatus } from "./lead-status-mirror.js";

/**
 * A lead's status, changed in the CRM. It's saved here first and stands even if Monday is down. For leads on the live
 * CRM board, the "נוצר קשר" label waits for the mirror to take it to Monday.
 * Spec: docs/superpowers/specs/2026-11-24-lead-status-crm-first-design.md
 */

export interface StatusChange {
  leadId: string;
  status: SettableStatus;
  byUserId: string;
}

/** Saves the change and logs who made it. "unchanged" when the lead already has that status: nothing is written. */
export async function setLeadStatus(db: Db, crmBoardId: string, change: StatusChange, now: Date): Promise<"changed" | "unchanged"> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: LeadStatus; monday_board_id: string }>(
      "SELECT status, monday_board_id FROM leads WHERE id = $1 AND removed_at IS NULL FOR UPDATE",
      [change.leadId],
    );
    const lead = rows[0];
    if (!lead) throw new NotFoundError("Lead");
    if (lead.status === change.status) return "unchanged";
    const waitingLabel = lead.monday_board_id === crmBoardId ? labelFor(change.status) : null;
    await tx.query(
      `UPDATE leads SET status = $2, status_changed_at = $3, status_changed_by = $4, monday_label_pending = $5,
         monday_sync_attempts = 0, monday_sync_error = NULL, monday_sync_next_at = NULL
       WHERE id = $1`,
      [change.leadId, change.status, now, change.byUserId, waitingLabel],
    );
    await tx.query("INSERT INTO audit_log (at, by_user_id, action, details) VALUES ($1, $2, 'lead-status-changed', $3::text::jsonb)", [
      now,
      change.byUserId,
      JSON.stringify({ leadId: change.leadId, from: lead.status, to: change.status }),
    ]);
    return "changed";
  });
}
```

- [ ] **Step 4: Validate the body**

In `Server/src/domains/dashboard/dashboard.validator.ts`, add this import after the existing imports:

```ts
import { SETTABLE_STATUSES } from "./lead-status-mirror.js";
```

Then add this after `LeadListQuerySchema`:

```ts
/** A status someone gives a lead: the board's five columns. "details-sent" stays Monday's own. */
export const LeadStatusSchema = z.object({ status: z.enum(SETTABLE_STATUSES) }).strict();
```

- [ ] **Step 5: Build the mirror's settings from the environment**

Create `Server/src/domains/dashboard/lead-status-mirror.cron.ts`:

```ts
import { env } from "../../config/env.js";
import type { Db } from "../../config/pg.js";
import { gql } from "../monday/monday.client.js";
import type { MirrorDeps } from "./lead-status-mirror.js";

/** The real Monday and the live CRM board. Tests pass a fake instead. */
export function mirrorDepsFromEnv(db: Db): MirrorDeps {
  return { db, gql, crmBoardId: env.MONDAY_BOARD_CRM_ID, now: () => new Date() };
}
```

- [ ] **Step 6: Add the route**

In `Server/src/domains/dashboard/dashboard.routes.ts`:

1. Add these imports after the line `import { idParam, sendData } from "./dashboard.format.js";`:

```ts
import { mirrorDepsFromEnv } from "./lead-status-mirror.cron.js";
import { mirrorSoon, type MirrorDeps } from "./lead-status-mirror.js";
import { setLeadStatus } from "./lead-status.service.js";
```

2. Add `LeadStatusSchema,` to the import list from `./dashboard.validator.js`, right after `LeadListQuerySchema,`.

3. In `interface DashboardOptions`, after the `copy?` entry, add:

```ts
  /** Monday's label after a status change: whether it's sent, and how to reach Monday. Tests pass a fake. */
  mirror?: { enabled: boolean; deps: (db: Db) => MirrorDeps };
```

4. In `createDashboardRouter`, after `const whatsapp = ...`, add:

```ts
  const mirror = options.mirror ?? { enabled: env.MONDAY_COPY_ENABLED, deps: mirrorDepsFromEnv };
```

5. Replace the comment `// ---- Leads (read-only: edited in Monday until the switch-over) ----` with
   `// ---- Leads (copied from Monday; the status can change here too, and Monday's label follows) ----`.

6. After the `router.get("/leads/:id", ...)` handler, add:

```ts
  router.post("/leads/:id/status", requireAccess("leads", "full"), validate({ body: LeadStatusSchema }), async (req, res) => {
    const id = idParam(req.params.id, "Lead");
    const deps = mirror.deps(db(res));
    const change = await setLeadStatus(db(res), deps.crmBoardId, { leadId: id, status: req.body.status, byUserId: staffOf(req).user.id }, now(res));
    if (change === "changed" && mirror.enabled) await mirrorSoon(deps, id);
    sendData(res, await getLead(db(res), id));
  });
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard`
Expected: PASS, the route tests and the mirror tests.

- [ ] **Step 8: Typecheck**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add Server/src/domains/dashboard/lead-status.service.ts Server/src/domains/dashboard/lead-status-mirror.cron.ts Server/src/domains/dashboard/dashboard.validator.ts Server/src/domains/dashboard/dashboard.routes.ts Server/src/domains/dashboard/dashboard.routes.test.ts
git commit -m "feat: set a lead's status from the dashboard, saved in the CRM first" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The retry job

**Files:**
- Modify: `Server/src/domains/dashboard/lead-status-mirror.cron.ts`
- Modify: `Server/src/db/startup.ts`
- Test: `Server/src/domains/dashboard/lead-status-mirror.cron.test.ts`

**Interfaces:**
- Consumes: `retryPending` (Task 2) and `mirrorDepsFromEnv` (Task 3).
- Produces: `MIRROR_SCHEDULE = "*/2 * * * *"` and `startLeadStatusMirror(db: Db, enabled = env.MONDAY_COPY_ENABLED): void`.

- [ ] **Step 1: Write the failing test**

Create `Server/src/domains/dashboard/lead-status-mirror.cron.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
const scheduled = vi.hoisted(() => [] as Array<{ expression: string; job: () => Promise<void> }>);
vi.mock("../../lib/cron-job.js", () => ({
  scheduleExclusive: (expression: string, _label: string, job: () => Promise<void>) => {
    scheduled.push({ expression, job });
  },
}));

import type { Db } from "../../config/pg.js";
import { MIRROR_SCHEDULE, startLeadStatusMirror } from "./lead-status-mirror.cron.js";

describe("the lead status retry job", () => {
  it("runs every 2 minutes where the Monday copy is on, and sends the labels that are due", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const db = { query, exec: vi.fn(), transaction: vi.fn() } as unknown as Db;
    startLeadStatusMirror(db, false);
    expect(scheduled).toHaveLength(0);
    startLeadStatusMirror(db, true);
    expect(MIRROR_SCHEDULE).toBe("*/2 * * * *");
    expect(scheduled.map((entry) => entry.expression)).toEqual([MIRROR_SCHEDULE]);
    await scheduled[0].job();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("monday_label_pending IS NOT NULL"), expect.any(Array));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/lead-status-mirror.cron.test.ts`
Expected: FAIL. `startLeadStatusMirror` and `MIRROR_SCHEDULE` aren't exported.

- [ ] **Step 3: Write the job**

Replace the whole of `Server/src/domains/dashboard/lead-status-mirror.cron.ts` with:

```ts
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { Db } from "../../config/pg.js";
import { scheduleExclusive } from "../../lib/cron-job.js";
import { gql } from "../monday/monday.client.js";
import { retryPending, type MirrorDeps } from "./lead-status-mirror.js";

/** Every 2 minutes. */
export const MIRROR_SCHEDULE = "*/2 * * * *";

/** The real Monday and the live CRM board. Tests pass a fake instead. */
export function mirrorDepsFromEnv(db: Db): MirrorDeps {
  return { db, gql, crmBoardId: env.MONDAY_BOARD_CRM_ID, now: () => new Date() };
}

/** Sends the status labels still waiting for Monday, every 2 minutes, wherever the Monday copy is on. */
export function startLeadStatusMirror(db: Db, enabled = env.MONDAY_COPY_ENABLED): void {
  if (!enabled) {
    logger.info("Lead status mirror off (MONDAY_COPY_ENABLED=false)");
    return;
  }
  const deps = mirrorDepsFromEnv(db);
  scheduleExclusive(MIRROR_SCHEDULE, "Lead status mirror", async () => {
    const { done, failed } = await retryPending(deps);
    if (done || failed) logger.info({ done, failed }, "Lead status mirror ran");
  });
  logger.info({ schedule: MIRROR_SCHEDULE }, "Lead status mirror scheduled");
}
```

In `Server/src/db/startup.ts`:

1. Add the import after the `startMondayCopy` import:

```ts
import { startLeadStatusMirror } from "../domains/dashboard/lead-status-mirror.cron.js";
```

2. In `startCrmAutomations`, after `startMondayCopy(db);`, add:

```ts
  startLeadStatusMirror(db);
```

- [ ] **Step 4: Run the test to see it pass, then the whole server suite**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/lead-status-mirror.cron.test.ts && npm test`
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add Server/src/domains/dashboard/lead-status-mirror.cron.ts Server/src/domains/dashboard/lead-status-mirror.cron.test.ts Server/src/db/startup.ts
git commit -m "feat: retry status labels Monday hasn't taken, every 2 minutes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The copy brings in Monday's edits, not echoes of the CRM's

**Files:**
- Modify: `Server/src/domains/monday-copy/monday-copy.repository.ts` (`saveLeads`)
- Test: `Server/src/domains/dashboard/lead-status-mirror.test.ts`

**Interfaces:**
- Consumes:
  - Task 1's columns;
  - `copyBoards` passes `at` (taken before any board is read) as `saveLeads`'s `now`, which is `$2` in its SQL.

- [ ] **Step 1: Write the tests**

Append to `Server/src/domains/dashboard/lead-status-mirror.test.ts`:

```ts
describe("the 2-hourly copy", () => {
  const later = () => {
    clock = new Date(clock.getTime() + 2 * 3_600_000);
  };
  const recopy = () => copyFromMonday(copyDeps(), "schedule");
  const mondayRow = (itemId: string) => monday.boards[0].rows.find((candidate) => candidate.id === itemId)!;

  it("keeps the CRM's status while its label is on the way to Monday", async () => {
    await waiting("101", "no-answer", "אין מענה");
    later();
    await recopy();
    expect(await row("101")).toMatchObject({ status: "no-answer", contact_status: "נוצר קשר", monday_label_pending: "אין מענה" });
  });

  it("keeps a status changed in the CRM after the copy began reading Monday", async () => {
    later();
    const gql = monday.gql;
    let changed = false;
    const copying: CopyDeps = {
      ...copyDeps(),
      gql: (async (query: string, variables?: Record<string, unknown>) => {
        const answer = await gql(query, variables);
        if (!changed && query.includes("items_page")) {
          // A drag lands while the copy reads Monday, and Monday takes the label at once. The copy still saw the old one.
          changed = true;
          await db.query("UPDATE leads SET status = 'no-answer', status_changed_at = $2, contact_status = 'אין מענה' WHERE monday_item_id = $1", [
            "101",
            new Date(clock.getTime() + 1000),
          ]);
        }
        return answer;
      }) as CopyDeps["gql"],
    };
    await copyFromMonday(copying, "schedule");
    expect((await row("101")).status).toBe("no-answer");
  });

  it("keeps the CRM's status when nothing about it changed in Monday", async () => {
    await waiting("101", "no-answer", "אין מענה");
    await mirrorStatus(deps(), await leadId("101"));
    later();
    await recopy();
    expect((await row("101")).status).toBe("no-answer");
  });

  it("takes Monday's status when the office changed the label there", async () => {
    await waiting("101", "no-answer", "אין מענה");
    await mirrorStatus(deps(), await leadId("101"));
    mondayRow("101").values.contact = "לא רלוונטי";
    later();
    await recopy();
    expect(await row("101")).toMatchObject({ status: "not-relevant", contact_status: "לא רלוונטי" });
  });

  it("takes Monday's status when the office moved the lead to another group", async () => {
    monday.boards[0].groups.push({ id: "g_followup", title: "פולואפ" });
    // שירה כהן has no label: in a follow-up group she counts as in talks.
    mondayRow("103").group = "g_followup";
    later();
    await recopy();
    expect((await row("103")).status).toBe("talking");
  });

  it("gives a lead that's new to the CRM Monday's status", async () => {
    monday.boards[0].rows.push({
      id: "104",
      name: "דנה לוי",
      group: "g_new",
      created: "2026-11-24T07:00:00Z",
      updated: "2026-11-24T07:00:00Z",
      values: { phone: "0500000004", contact: "אין מענה", source: "אורגני" },
    });
    later();
    await recopy();
    expect((await row("104")).status).toBe("no-answer");
  });
});
```

- [ ] **Step 2: Run them to see the first two fail**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/lead-status-mirror.test.ts -t "the 2-hourly copy"`
Expected: two tests FAIL, "keeps the CRM's status while its label is on the way" and "keeps a status changed in the CRM
after the copy began". Each gets `talking` back from Monday. The other four pass already: they pin behavior that must
not change.

- [ ] **Step 3: Change the copy's upsert**

In `Server/src/domains/monday-copy/monday-copy.repository.ts`:

1. Add this above `export async function saveLeads`:

```ts
/**
 * When the copy leaves a lead's status as the CRM has it (spec 2026-11-24):
 * - a change made in the CRM is still on its way to Monday;
 * - or the change was made after this copy began reading Monday ($2 is the copy's start);
 * - or nothing about the status changed in Monday: the same group and the same label.
 * Otherwise the change was made in Monday, and Monday's is newer.
 */
const KEEP_CRM_STATUS = `(leads.monday_label_pending IS NOT NULL
  OR leads.status_changed_at > $2
  OR (leads.monday_group = EXCLUDED.monday_group AND leads.contact_status IS NOT DISTINCT FROM EXCLUDED.contact_status))`;
```

2. In `saveLeads`'s `ON CONFLICT (monday_item_id) DO UPDATE SET` list, replace
   `status = EXCLUDED.status,` with:

```ts
         status = CASE WHEN ${KEEP_CRM_STATUS} THEN leads.status ELSE EXCLUDED.status END,
```

   Then replace `contact_status = EXCLUDED.contact_status,` with:

```ts
         contact_status = CASE WHEN ${KEEP_CRM_STATUS} THEN leads.contact_status ELSE EXCLUDED.contact_status END,
```

   Every other column keeps `= EXCLUDED.<column>`. In an `ON CONFLICT` update, `leads.<column>` reads the row as it
   was before this update, so `leads.monday_group` above is the old group even though the same statement sets the new
   one.

- [ ] **Step 4: Run the tests to see them pass, then the whole server suite**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npx vitest run src/domains/dashboard/lead-status-mirror.test.ts && npm test`
Expected: PASS everywhere, including the copy's own tests in `src/domains/monday-copy`.

- [ ] **Step 5: Lint and typecheck the server**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add Server/src/domains/monday-copy/monday-copy.repository.ts Server/src/domains/dashboard/lead-status-mirror.test.ts
git commit -m "feat: the Monday copy keeps statuses changed in the CRM, and still takes Monday's edits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Dashboard data: `setStatus`, the demo, and the optimistic hook

**Files:**
- Modify: `dashboard/src/data/types.ts`
- Modify: `dashboard/src/data/services.ts`
- Modify: `dashboard/src/data/http/leads.ts`
- Modify: `dashboard/src/test/services.ts`
- Create: `dashboard/src/test/leads.ts`
- Modify: `dashboard/src/data/demo/demoServices.ts`
- Modify: `dashboard/src/data/demo/demoServices.test.ts`
- Modify: `dashboard/src/data/queries.ts`
- Test: `dashboard/src/data/queries.test.tsx`

**Interfaces:**
- Consumes: the server route from Task 3, which answers with the lead including `mondayPending`.
- Produces:
  - `type SettableLeadStatus = Exclude<LeadStatus, "details-sent">`;
  - `Lead.mondayPending: boolean`;
  - `LeadsService.setStatus(id: string, status: SettableLeadStatus): Promise<Lead>`;
  - `useSetLeadStatus()`: a mutation taking `{ id, status }`;
  - `testLead(overrides?: Partial<Lead>): Lead`, from `src/test/leads.ts`.

- [ ] **Step 1: Install the dashboard's packages in the worktree**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npm ci`
Expected: it finishes without errors.

- [ ] **Step 2: Add the types**

In `dashboard/src/data/types.ts`, right after the line `export type LeadStatus = ...`, add:

```ts
/** The statuses a person can give a lead: the board's five columns. "details-sent" stays Monday's own, under In progress. */
export type SettableLeadStatus = Exclude<LeadStatus, "details-sent">;
```

In `interface Lead`, after `nextStep: string | null;`, add:

```ts
  /** A status changed here whose label hasn't reached Monday yet. */
  mondayPending: boolean;
```

- [ ] **Step 3: Add `setStatus` to the services**

In `dashboard/src/data/services.ts`:

1. Add `SettableLeadStatus` to the type import from `"./types"`.
2. Replace the `LeadsService` block with:

```ts
/** Leads are copied from Monday. Their status can also change here: the server saves it, then sets Monday's label. */
export interface LeadsService {
  /** The open pipeline, newest Monday update first. */
  list(filters?: LeadFilters): Promise<Lead[]>;
  counts(): Promise<LeadCounts>;
  /** How many leads came in on each day, oldest first; days without leads are left out. */
  days(): Promise<LeadDay[]>;
  /** With its Monday notes. */
  get(id: string): Promise<Lead>;
  /** Gives the lead a new status. Resolves with the lead as saved; mondayPending until Monday has the label. */
  setStatus(id: string, status: SettableLeadStatus): Promise<Lead>;
}
```

In `dashboard/src/data/http/leads.ts`, add after the `get:` entry:

```ts
    setStatus: (id, status) => http.post<Lead>(`/leads/${segment(id)}/status`, { status }, "Lead", id),
```

In `dashboard/src/test/services.ts`, in the `leads: { ... }` object after `get: missing("Lead"),`, add:

```ts
      setStatus: missing("Lead"),
```

- [ ] **Step 4: Add a made-up lead for tests**

Create `dashboard/src/test/leads.ts`:

```ts
import type { Lead } from "../data/types";

/** A made-up lead for tests: the name and number are invented. */
export function testLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    name: "יעל פרץ",
    phone: "0540000001",
    source: "instagram",
    status: "talking",
    service: "uman",
    groupId: null,
    assigneeId: null,
    mondayBoard: "רונית  - CRM",
    mondayGroup: "לידים חדשים אורטל",
    mondayUrl: "https://example.monday.com/boards/1/pulses/1",
    createdAt: "2026-11-20T08:00:00.000Z",
    updatedAt: "2026-11-20T08:00:00.000Z",
    lastNote: "",
    archived: false,
    calls: 0,
    lastCallOn: null,
    inquiryOn: "2026-11-20",
    lastMessage: null,
    nextStep: null,
    history: [],
    mondayPending: false,
    ...overrides,
  };
}
```

- [ ] **Step 5: Write the failing tests**

In `dashboard/src/data/demo/demoServices.test.ts`, add inside `describe("the demo's sample data", ...)`:

```ts
  it("changes a lead's status in memory, so the demo board drags", async () => {
    const demo = createDemoServices(ME);
    const [lead] = await demo.leads.list({ status: "new" });
    expect(await demo.leads.setStatus(lead.id, "no-answer")).toMatchObject({ id: lead.id, status: "no-answer", mondayPending: false });
    expect((await demo.leads.get(lead.id)).status).toBe("no-answer");
    await expect(demo.leads.setStatus("no-such-lead", "new")).rejects.toThrow();
  });
```

In `dashboard/src/data/queries.test.tsx`:

1. Add `useSetLeadStatus` to the import from `"./queries"`.
2. Add `import type { Lead } from "./types";`, or add `Lead` to the existing type import from `"./types"`.
3. Add `import { testLead } from "../test/leads";`.
4. Add this test inside `describe("query hooks", ...)`:

```ts
  it("moves a lead to its new status at once, and puts it back if the change fails", async () => {
    const { services, client, wrapper } = setup();
    let stored = testLead();
    services.leads.list = async () => [stored];
    services.leads.get = async () => stored;
    services.leads.setStatus = async (_id, status) => {
      stored = { ...stored, status };
      return stored;
    };
    client.setQueryData(queryKeys.leads({}), [stored]);
    const { result } = renderHook(() => useSetLeadStatus(), { wrapper });

    await act(() => result.current.mutateAsync({ id: stored.id, status: "no-answer" }));
    expect(client.getQueryData<Lead[]>(queryKeys.leads({}))?.[0].status).toBe("no-answer");

    let fail!: (error: Error) => void;
    services.leads.setStatus = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });
    act(() => {
      result.current.mutate({ id: stored.id, status: "registered" });
    });
    await waitFor(() => expect(client.getQueryData<Lead[]>(queryKeys.leads({}))?.[0].status).toBe("registered"));
    await act(async () => fail(new Error("offline")));
    await waitFor(() => expect(client.getQueryData<Lead[]>(queryKeys.leads({}))?.[0].status).toBe("no-answer"));
  });
```

- [ ] **Step 6: Run them to see them fail**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/data/queries.test.tsx src/data/demo/demoServices.test.ts`
Expected: FAIL. `useSetLeadStatus` isn't exported, and `demo.leads.setStatus` isn't a function.

- [ ] **Step 7: Make the demo change statuses**

In `dashboard/src/data/demo/demoServices.ts`:

1. In `buildLeads`, in the object pushed for each lead, add after `nextStep: NEXT_STEP[status] ?? null,`:

```ts
        mondayPending: false,
```

2. Replace the whole `createLeads` function with:

```ts
function createLeads(leads: Lead[]): DataServices["leads"] {
  const arrived = (lead: Lead) => lead.inquiryOn ?? isoDay(new Date(lead.createdAt));
  const get = async (id: string): Promise<Lead> => {
    const lead = leads.find((entry) => entry.id === id);
    if (!lead) throw new NotFoundError("Lead", id);
    const first = { id: `${id}-first`, at: lead.createdAt, text: "פנתה דרך הטופס, ביקשה פרטים על הטיסה", byUserId: null, author: OFFICE_NOTES, mondayBoard: lead.mondayBoard };
    const latest = { id: `${id}-note`, at: lead.updatedAt, text: lead.lastNote, byUserId: null, author: OFFICE_NOTES, mondayBoard: lead.mondayBoard };
    return { ...lead, history: lead.status === "new" ? [latest] : [latest, first] };
  };
  return {
    list: async (filters: LeadFilters = {}) => {
      const term = filters.search?.trim() ?? "";
      const digits = term.replace(/\D/g, "");
      return leads
        .filter((lead) => (filters.day ? arrived(lead) === filters.day : term ? true : !lead.archived))
        .filter((lead) => (!filters.status || filters.status === "all" ? lead.status !== "not-relevant" : lead.status === filters.status))
        .filter((lead) => !filters.source || lead.source === filters.source)
        .filter((lead) => !filters.service || lead.service === filters.service)
        .filter((lead) => !term || lead.name.includes(term) || (digits.length > 0 && lead.phone.includes(digits)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    counts: async () => {
      const counts: LeadCounts = { all: 0, new: 0, "no-answer": 0, talking: 0, "details-sent": 0, registered: 0, "not-relevant": 0 };
      for (const lead of leads) {
        if (lead.archived) continue;
        counts[lead.status] += 1;
        if (lead.status !== "not-relevant") counts.all += 1;
      }
      return counts;
    },
    days: async () => {
      const tally = new Map<string, number>();
      for (const lead of leads) tally.set(arrived(lead), (tally.get(arrived(lead)) ?? 0) + 1);
      return [...tally.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
    },
    get,
    // In memory only, like every change in the demo: there's no Monday behind it, so nothing waits.
    setStatus: async (id, status) => {
      const index = leads.findIndex((entry) => entry.id === id);
      if (index < 0) throw new NotFoundError("Lead", id);
      leads[index] = { ...leads[index], status, mondayPending: false };
      return get(id);
    },
  };
}
```

- [ ] **Step 8: Add the hook**

In `dashboard/src/data/queries.ts`:

1. Add `SettableLeadStatus` to the type import from `"./types"`, and `Lead` too if it isn't imported already.
2. After `export function useLead(...)`, add:

```ts
/** What a status change put aside, to put back if the call fails. */
interface LeadStatusSnapshot {
  id: string;
  lists: Array<[QueryKey, Lead[] | undefined]>;
  detail: Lead | undefined;
}

/**
 * Gives a lead a new status. It changes at once in every cached list and in the lead's own card, so the board moves the
 * card while the call is out. A failed call puts everything back. Then the leads and the overview refresh.
 */
export function useSetLeadStatus() {
  const { leads } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SettableLeadStatus }) => leads.setStatus(id, status),
    onMutate: async ({ id, status }): Promise<LeadStatusSnapshot> => {
      await client.cancelQueries({ queryKey: ["leads"] });
      const lists = client.getQueriesData<Lead[]>({ queryKey: ["leads", "list"] });
      const detail = client.getQueryData<Lead>(queryKeys.lead(id));
      client.setQueriesData<Lead[]>({ queryKey: ["leads", "list"] }, (list) => list?.map((lead) => (lead.id === id ? { ...lead, status } : lead)));
      if (detail) client.setQueryData<Lead>(queryKeys.lead(id), { ...detail, status });
      return { id, lists, detail };
    },
    onError: (_error, _variables, snapshot) => {
      if (!snapshot) return;
      for (const [key, list] of snapshot.lists) client.setQueryData(key, list);
      if (snapshot.detail) client.setQueryData(queryKeys.lead(snapshot.id), snapshot.detail);
    },
    onSuccess: (lead) => client.setQueryData(queryKeys.lead(lead.id), lead),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["leads"] });
      await client.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/data`
Expected: PASS.

- [ ] **Step 10: Typecheck**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npm run typecheck`
Expected: no errors. Every `Lead` literal now has `mondayPending`: the demo's `buildLeads` and `testLead`.

- [ ] **Step 11: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add dashboard/src/data dashboard/src/test/services.ts dashboard/src/test/leads.ts
git commit -m "feat(dashboard): set a lead's status, with an optimistic move and a demo version" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The board's columns, drops and errors (pure helpers)

**Files:**
- Modify: `dashboard/src/screens/leads/leads-model.ts`
- Test: `dashboard/src/screens/leads/leads-model.test.ts`

**Interfaces:**
- Consumes: `SettableLeadStatus` (Task 6) and `testLead` (Task 6).
- Produces, from `leads-model.ts`:
  - `type DropTarget = BoardColumnKey | "not-relevant"` and `type Board = Record<DropTarget, Lead[]>`;
  - `STATUS_CHOICES: ReadonlyArray<{ target: DropTarget; status: SettableLeadStatus }>`, in board order;
  - `columnOf(status: LeadStatus): DropTarget`;
  - `statusForDrop(lead: Pick<Lead, "status">, target: DropTarget): SettableLeadStatus | null`;
  - `isDropTarget(id: string): id is DropTarget`;
  - `boardLeads(open: Lead[], closed: Lead[]): Board`;
  - `moveFor(board: Board, leadId: string, overId: string | null): { lead: Lead; status: SettableLeadStatus } | null`;
  - `type StatusChangeProblem = "gone" | "no-access" | "failed"` and `statusChangeProblem(error: unknown): StatusChangeProblem`.

- [ ] **Step 1: Write the failing tests**

Create `dashboard/src/screens/leads/leads-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError } from "../../data/http/client";
import { NotFoundError } from "../../data/services";
import { testLead } from "../../test/leads";
import { boardLeads, columnOf, moveFor, STATUS_CHOICES, statusChangeProblem, statusForDrop } from "./leads-model";

describe("the board's columns", () => {
  it("puts each status in its column, with details sent beside in talks", () => {
    expect(columnOf("new")).toBe("new");
    expect(columnOf("talking")).toBe("working");
    expect(columnOf("details-sent")).toBe("working");
    expect(columnOf("no-answer")).toBe("no-answer");
    expect(columnOf("registered")).toBe("registered");
    expect(columnOf("not-relevant")).toBe("not-relevant");
  });

  it("offers the five columns in board order, each with the status it gives", () => {
    expect(STATUS_CHOICES).toEqual([
      { target: "new", status: "new" },
      { target: "working", status: "talking" },
      { target: "no-answer", status: "no-answer" },
      { target: "registered", status: "registered" },
      { target: "not-relevant", status: "not-relevant" },
    ]);
  });

  it("gives a dropped lead its new column's status, and nothing in its own column", () => {
    expect(statusForDrop({ status: "new" }, "working")).toBe("talking");
    expect(statusForDrop({ status: "details-sent" }, "working")).toBeNull();
    expect(statusForDrop({ status: "talking" }, "not-relevant")).toBe("not-relevant");
    expect(statusForDrop({ status: "not-relevant" }, "new")).toBe("new");
    expect(statusForDrop({ status: "registered" }, "registered")).toBeNull();
  });

  it("lays the open and not-relevant lists out once each, by status", () => {
    const working = testLead({ id: "a", status: "talking" });
    const closed = testLead({ id: "b", status: "not-relevant" });
    // Moved to not relevant a moment ago: still in the open list until it refreshes.
    const justClosed = testLead({ id: "c", status: "not-relevant" });
    const board = boardLeads([working, justClosed], [closed, justClosed]);
    expect(board.working.map((lead) => lead.id)).toEqual(["a"]);
    expect(board["not-relevant"].map((lead) => lead.id)).toEqual(["c", "b"]);
    expect(board.new).toEqual([]);
  });

  it("turns a drop into a move, or nothing", () => {
    const lead = testLead({ id: "a", status: "new" });
    const board = boardLeads([lead], []);
    expect(moveFor(board, "a", "no-answer")).toEqual({ lead, status: "no-answer" });
    expect(moveFor(board, "a", "new")).toBeNull();
    expect(moveFor(board, "a", null)).toBeNull();
    expect(moveFor(board, "a", "somewhere-else")).toBeNull();
    expect(moveFor(board, "missing", "no-answer")).toBeNull();
  });

  it("says why a status change didn't go through", () => {
    expect(statusChangeProblem(new NotFoundError("Lead", "a"))).toBe("gone");
    expect(statusChangeProblem(new ApiError(403, "NO_ACCESS", "no"))).toBe("no-access");
    expect(statusChangeProblem(new Error("offline"))).toBe("failed");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/screens/leads/leads-model.test.ts`
Expected: FAIL. `boardLeads`, `columnOf` and the rest aren't exported.

- [ ] **Step 3: Write the helpers**

In `dashboard/src/screens/leads/leads-model.ts`:

1. Replace the first import line with:

```ts
import { ApiError } from "../../data/http/client";
import { NotFoundError } from "../../data/services";
import type { Lead, LeadService, LeadStatus, SettableLeadStatus } from "../../data/types";
```

2. After the `BOARD_COLUMNS` constant, add:

```ts
/** Where a card can be dropped: an open column, or the folded not-relevant one. */
export type DropTarget = BoardColumnKey | "not-relevant";

/** The leads in each column. */
export type Board = Record<DropTarget, Lead[]>;

/** The status a column gives a lead dropped on it (In progress gives "in talks"), in board order. */
const DROP_STATUS: Record<DropTarget, SettableLeadStatus> = {
  new: "new",
  working: "talking",
  "no-answer": "no-answer",
  registered: "registered",
  "not-relevant": "not-relevant",
};

/** The status menu's choices: the board's five columns, in order. */
export const STATUS_CHOICES: ReadonlyArray<{ target: DropTarget; status: SettableLeadStatus }> = (Object.keys(DROP_STATUS) as DropTarget[]).map(
  (target) => ({ target, status: DROP_STATUS[target] }),
);

/** The column a status sits in. "Details sent" shares In progress with "in talks". */
export function columnOf(status: LeadStatus): DropTarget {
  return BOARD_COLUMNS.find((column) => column.statuses.includes(status))?.key ?? "not-relevant";
}

/** The status a drop on `target` gives the lead, or null when the lead already sits there. */
export function statusForDrop(lead: Pick<Lead, "status">, target: DropTarget): SettableLeadStatus | null {
  return columnOf(lead.status) === target ? null : DROP_STATUS[target];
}

const DROP_TARGETS = new Set<string>(Object.keys(DROP_STATUS));

export function isDropTarget(id: string): id is DropTarget {
  return DROP_TARGETS.has(id);
}

/**
 * The open and not-relevant lists as one board: each lead once, in the column its status says. A lead whose status
 * just changed can still sit in its old list until the lists refresh; it shows in its new column all the same.
 */
export function boardLeads(open: Lead[], closed: Lead[]): Board {
  const board: Board = { new: [], working: [], "no-answer": [], registered: [], "not-relevant": [] };
  const seen = new Set<string>();
  for (const lead of [...open, ...closed]) {
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    board[columnOf(lead.status)].push(lead);
  }
  return board;
}

/** What a drop asks for: the lead and its new status, or null when nothing changes. */
export function moveFor(board: Board, leadId: string, overId: string | null): { lead: Lead; status: SettableLeadStatus } | null {
  if (!overId || !isDropTarget(overId)) return null;
  const lead = Object.values(board)
    .flat()
    .find((entry) => entry.id === leadId);
  const status = lead ? statusForDrop(lead, overId) : null;
  return lead && status ? { lead, status } : null;
}

export type StatusChangeProblem = "gone" | "no-access" | "failed";

/** Why a status change didn't go through, for the toast: the lead left the board, no access, or anything else. */
export function statusChangeProblem(error: unknown): StatusChangeProblem {
  if (error instanceof NotFoundError) return "gone";
  if (error instanceof ApiError && error.status === 403) return "no-access";
  return "failed";
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/screens/leads/leads-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add dashboard/src/screens/leads/leads-model.ts dashboard/src/screens/leads/leads-model.test.ts
git commit -m "feat(dashboard): board columns, drops and status-change errors as plain helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The status menu, and the "waiting for Monday" line

**Files:**
- Modify: `dashboard/src/content/leads.he.ts`
- Modify: `dashboard/src/content/leads.en.ts`
- Create: `dashboard/src/screens/leads/useChangeLeadStatus.ts`
- Create: `dashboard/src/screens/leads/LeadStatusControl.tsx`
- Modify: `dashboard/src/screens/leads/LeadDetailParts.tsx`
- Test: `dashboard/src/screens/leads/LeadStatusControl.test.tsx`
- Test: `dashboard/src/screens/leads/LeadDetailParts.test.tsx`

**Interfaces:**
- Consumes: `useSetLeadStatus` and `testLead` (Task 6); `STATUS_CHOICES`, `columnOf`, `statusChangeProblem` and
  `STATUS_TONE` (Task 7); `useCan` (existing).
- Produces:
  - `useChangeLeadStatus(): (lead: Lead, status: SettableLeadStatus) => void`;
  - `<LeadStatusControl lead={lead} />`;
  - new copy keys: `leadsCopy.statusChange.{gone,"no-access",failed}`, `leadsCopy.detail.statusLabel` and
    `leadsCopy.detail.mondayPending`.

- [ ] **Step 1: Write the failing tests**

Create `dashboard/src/screens/leads/LeadStatusControl.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Lead, SettableLeadStatus } from "../../data/types";
import { renderApp, signedInServices } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadStatusControl } from "./LeadStatusControl";

describe("LeadStatusControl", () => {
  it("lets people with full access give the lead another status", async () => {
    const services = await signedInServices();
    const lead = testLead({ status: "details-sent" });
    const setStatus = vi.fn(async (_id: string, status: SettableLeadStatus): Promise<Lead> => ({ ...lead, status }));
    services.leads.setStatus = setStatus;
    renderApp([{ path: "/", element: <LeadStatusControl lead={lead} /> }], { services });
    const menu = await screen.findByRole("combobox", { name: "שינוי סטטוס" });
    expect(menu).toHaveValue("working");
    await userEvent.selectOptions(menu, "no-answer");
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(lead.id, "no-answer"));
  });

  it("shows the status as a tag to people who may only look", async () => {
    const services = await signedInServices();
    const table = await services.users.permissions();
    const permissions = vi.fn(async () => table.map((row) => (row.area === "leads" ? { ...row, access: { ...row.access, admin: "view" as const } } : row)));
    services.users.permissions = permissions;
    renderApp([{ path: "/", element: <LeadStatusControl lead={testLead({ status: "talking" })} /> }], { services });
    await waitFor(() => expect(permissions).toHaveBeenCalled());
    expect(await screen.findByText("בשיחה")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
```

Create `dashboard/src/screens/leads/LeadDetailParts.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadInMonday } from "./LeadDetailParts";

describe("LeadInMonday", () => {
  it("says when a status changed here hasn't reached Monday yet", () => {
    renderApp([{ path: "/", element: <LeadInMonday lead={testLead({ mondayPending: true })} level={3} /> }]);
    expect(screen.getByRole("status")).toHaveTextContent("הסטטוס עוד לא הגיע ל-Monday");
  });

  it("says nothing about it once Monday is in step", () => {
    renderApp([{ path: "/", element: <LeadInMonday lead={testLead()} level={3} /> }]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/screens/leads/LeadStatusControl.test.tsx src/screens/leads/LeadDetailParts.test.tsx`
Expected: FAIL. `./LeadStatusControl` can't be resolved, and there's no status line.

- [ ] **Step 3: Add the texts**

In `dashboard/src/content/leads.he.ts`:

1. Before the `empty: {` block (the top-level one, after `board`), add:

```ts
  /** When a status change didn't go through: a drop on the board, or the status menu. */
  statusChange: {
    gone: "הסטטוס לא השתנה: הליד הזה כבר לא בלוח",
    "no-access": "הסטטוס לא השתנה: אין לך הרשאה לשנות סטטוסים",
    failed: "הסטטוס לא השתנה. כדאי לנסות שוב",
  },

```

2. In `detail`, replace the `editInMonday` line with these three entries:

```ts
    editInMonday: "את הסטטוס משנים כאן, והוא מתעדכן גם ב-Monday. הערות עדיין נכתבות שם.",
    /** The status menu in the lead's header. */
    statusLabel: "שינוי סטטוס",
    /** A status changed here that Monday hasn't taken yet. */
    mondayPending: "הסטטוס עוד לא הגיע ל-Monday. ננסה שוב בעוד כמה דקות.",
```

In `dashboard/src/content/leads.en.ts`:

1. Before the top-level `empty: {` block, add:

```ts
  statusChange: {
    gone: "The status didn't change: this lead is no longer on the board",
    "no-access": "The status didn't change: your account can't change statuses",
    failed: "The status didn't change. Try again",
  },

```

2. In `detail`, replace the `editInMonday` line with:

```ts
    editInMonday: "Statuses change here, and Monday follows. Notes are still written in Monday.",
    statusLabel: "Change status",
    mondayPending: "The status hasn't reached Monday yet. Trying again in a few minutes.",
```

- [ ] **Step 4: Write the hook that changes a status and reports failures**

Create `dashboard/src/screens/leads/useChangeLeadStatus.ts`:

```ts
import { useCallback } from "react";
import { useCopy } from "../../content/locale";
import { useSetLeadStatus } from "../../data/queries";
import type { Lead, SettableLeadStatus } from "../../data/types";
import { useToast } from "../../ui/toast-context";
import { statusChangeProblem } from "./leads-model";

/** Changes a lead's status, from the board or the status menu. A change that didn't go through says why in a toast. */
export function useChangeLeadStatus(): (lead: Lead, status: SettableLeadStatus) => void {
  const { leadsCopy: copy } = useCopy();
  const { mutate } = useSetLeadStatus();
  const toast = useToast();
  return useCallback(
    (lead: Lead, status: SettableLeadStatus) => {
      if (lead.status === status) return;
      mutate(
        { id: lead.id, status },
        { onError: (error) => toast.show({ message: copy.statusChange[statusChangeProblem(error)], tone: "warning" }) },
      );
    },
    [copy, mutate, toast],
  );
}
```

- [ ] **Step 5: Write the status menu**

Create `dashboard/src/screens/leads/LeadStatusControl.tsx`:

```tsx
import { useCopy } from "../../content/locale";
import { useCan } from "../../data/queries";
import type { Lead } from "../../data/types";
import { Icon } from "../../ui/Icon";
import { StatusTag } from "../../ui/StatusTag";
import { columnOf, STATUS_CHOICES, STATUS_TONE } from "./leads-model";
import { useChangeLeadStatus } from "./useChangeLeadStatus";

/**
 * The lead's status in its header. People who may change statuses get a menu of the board's five columns: a native
 * select, so the keyboard, screen readers and the phone's own picker all work. Everyone else sees the status tag.
 */
export function LeadStatusControl({ lead }: { lead: Lead }) {
  const { leadsCopy: copy } = useCopy();
  const canChange = useCan("leads", "full");
  const changeStatus = useChangeLeadStatus();
  if (!canChange) return <StatusTag tone={STATUS_TONE[lead.status]}>{copy.status[lead.status]}</StatusTag>;
  const current = columnOf(lead.status);
  return (
    <span className="relative inline-flex shrink-0">
      <select
        aria-label={copy.detail.statusLabel}
        value={current}
        onChange={(event) => {
          const choice = STATUS_CHOICES.find((option) => option.target === event.target.value);
          if (choice && choice.target !== current) changeStatus(lead, choice.status);
        }}
        className="h-9 cursor-pointer appearance-none rounded-full bg-sand-light ps-3.5 pe-9 text-[13px] font-medium text-ink transition-colors hover:bg-sand"
      >
        {STATUS_CHOICES.map((option) => (
          // Options keep their own colors: some systems paint the open list with the select's colors.
          <option key={option.target} value={option.target} className="bg-paper text-ink">
            {copy.board.columns[option.target]}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-copy">
        <Icon name="chevronDown" size={14} />
      </span>
    </span>
  );
}
```

- [ ] **Step 6: Use it in the lead's header, and show the waiting line**

In `dashboard/src/screens/leads/LeadDetailParts.tsx`:

1. Delete the import line `import { StatusTag } from "../../ui/StatusTag";`.
2. Replace `import { initialOf, STATUS_TONE, telHref, whatsappHref } from "./leads-model";` with:

```ts
import { initialOf, telHref, whatsappHref } from "./leads-model";
import { LeadStatusControl } from "./LeadStatusControl";
```

3. In `LeadHeader`, replace the line `const status = <StatusTag tone={STATUS_TONE[lead.status]}>{copy.status[lead.status]}</StatusTag>;` with:

```tsx
  const status = <LeadStatusControl lead={lead} />;
```

4. Replace `LeadInMonday`'s doc comment and its `<p className="text-small text-mute">{copy.detail.editInMonday}</p>` line:

```tsx
/**
 * The lead in Monday: what Monday says comes next, her last Instagram message, and the way to her row there. The status
 * changes here and Monday follows; a status still on its way to Monday says so. Notes are still written in Monday.
 */
```

and

```tsx
      {lead.mondayPending ? (
        <p role="status" className="text-small text-status-warning">
          {copy.detail.mondayPending}
        </p>
      ) : null}
      <p className="text-small text-mute">{copy.detail.editInMonday}</p>
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/screens/leads`
Expected: PASS.

- [ ] **Step 8: Typecheck and lint**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npm run typecheck && npm run lint`
Expected: no errors. A missing English key would fail the typecheck through `Widen<typeof he>`.

- [ ] **Step 9: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add dashboard/src/content/leads.he.ts dashboard/src/content/leads.en.ts dashboard/src/screens/leads
git commit -m "feat(dashboard): change a lead's status from its card, and show when Monday is behind" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Drag and drop on the board

**Files:**
- Modify: `dashboard/package.json` and `dashboard/package-lock.json`, through npm
- Modify: `dashboard/src/screens/leads/LeadsKanban.tsx` (whole file below)
- Modify: `dashboard/src/screens/leads/LeadsDesktopPage.tsx`
- Modify: `dashboard/src/content/leads.he.ts` and `dashboard/src/content/leads.en.ts` (`board.drag`)
- Test: `dashboard/src/screens/leads/LeadsKanban.test.tsx`

**Interfaces:**
- Consumes: `boardLeads`, `moveFor` and `DropTarget` (Task 7); `useChangeLeadStatus` (Task 8); `useCan`.
- Produces: two new `LeadsKanban` props, `canMove?: boolean` and `onMove?: (lead: Lead, status: SettableLeadStatus) => void`.
  It also produces `data-draggable="true"` on draggable cards.

- [ ] **Step 1: Add dnd-kit**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npm install --save-exact @dnd-kit/core@6.3.1`
Expected: `package.json` has `"@dnd-kit/core": "6.3.1"` under dependencies, and `package-lock.json` changes.

- [ ] **Step 2: Write the failing tests**

Create `dashboard/src/screens/leads/LeadsKanban.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Lead } from "../../data/types";
import { renderApp } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadsKanban } from "./LeadsKanban";

type Settled = Parameters<typeof LeadsKanban>[0]["open"];
const settled = (data: Lead[]) => ({ data, isPending: false, isError: false, isUpdating: false, refetch: async () => undefined }) as unknown as Settled;

function renderBoard(open: Lead[], closed: Lead[], canMove: boolean) {
  return renderApp(
    [{ path: "/leads", element: <LeadsKanban open={settled(open)} closed={settled(closed)} leadHref={(id) => `/leads/${id}`} canMove={canMove} /> }],
    { path: "/leads" },
  );
}

describe("LeadsKanban", () => {
  it("lays the open and not-relevant leads out by status, once each", () => {
    renderBoard(
      [testLead({ id: "a", name: "יעל דהן", status: "details-sent" }), testLead({ id: "c", name: "חנה פרץ", status: "not-relevant" })],
      [testLead({ id: "b", name: "מאיה לוי", status: "not-relevant" })],
      true,
    );
    expect(within(screen.getByRole("region", { name: /בטיפול/ })).getByText("יעל דהן")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /לא רלוונטי/ })).toHaveTextContent("2");
  });

  it("lets cards drag only for people who may change statuses", () => {
    const { unmount } = renderBoard([testLead({ id: "a", name: "יעל דהן" })], [], true);
    expect(screen.getByText("יעל דהן").closest("li")).toHaveAttribute("data-draggable", "true");
    unmount();
    renderBoard([testLead({ id: "a", name: "יעל דהן" })], [], false);
    expect(screen.getByText("יעל דהן").closest("li")).not.toHaveAttribute("data-draggable");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/screens/leads/LeadsKanban.test.tsx`
Expected: FAIL. The folded column shows `1` instead of `2`, because it doesn't read the open list yet. There's also no
`data-draggable` attribute and no `canMove` prop.

- [ ] **Step 4: Add the drag announcements**

In `dashboard/src/content/leads.he.ts`, inside `board`, after the `call:` entry, add:

```ts
    /** Read out to screen readers while a card is dragged. */
    drag: {
      pickedUp: (name: string) => `הכרטיס של ${name} נגרר`,
      over: (column: string) => `מעל העמודה ${column}`,
      dropped: (name: string, column: string) => `הכרטיס של ${name} הועבר לעמודה ${column}`,
      cancelled: (name: string) => `הגרירה בוטלה. הכרטיס של ${name} נשאר במקומו`,
    },
```

In `dashboard/src/content/leads.en.ts`, inside `board`, after the `call:` entry, add:

```ts
    drag: {
      pickedUp: (name) => `Picked up ${name}'s card`,
      over: (column) => `Over the ${column} column`,
      dropped: (name, column) => `Moved ${name}'s card to ${column}`,
      cancelled: (name) => `Cancelled. ${name}'s card stayed where it was`,
    },
```

- [ ] **Step 5: Rewrite the board**

Replace the whole of `dashboard/src/screens/leads/LeadsKanban.tsx` with:

```tsx
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import type { Lead, SettableLeadStatus } from "../../data/types";
import { dayAt } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber } from "../../lib/format";
import { useFirstKeys, type RowMotion } from "../../motion/cascade";
import { CARD_PRESS_SCALE, springs } from "../../motion/springs";
import { cardVariants, rowVariants } from "../../motion/variants";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { Ltr } from "../../ui/Ltr";
import { ErrorState, Skeleton } from "../../ui/states";
import { StatusTag, type StatusTone } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import type { useSettledLeads } from "./leads-data";
import { arrivedOn, BOARD_COLUMNS, boardLeads, moveFor, telHref, whatsappHref, type DropTarget } from "./leads-model";

type SettledLeads = ReturnType<typeof useSettledLeads>;

/** A column shows this many cards, then a button for the rest. */
const CARD_LIMIT = 20;

/** A drag starts once the pointer has moved this far (px), so a plain press still opens the lead. */
const DRAG_DISTANCE = 6;

/** For this long after a drop (ms), a click on a card belongs to the drop and doesn't open the lead. */
const DROP_CLICK_MS = 300;

/** The column a dragged card is over. */
const DROP_HIGHLIGHT = "ring-2 ring-gold/70 ring-inset";

/** Each column's heading, filled with its status's color: white text only on the shades dark enough for it. */
const HEAD_CLASS: Record<DropTarget, string> = {
  new: "bg-status-new text-ink",
  working: "bg-status-talking-deep text-paper",
  "no-answer": "bg-status-warning text-paper",
  registered: "bg-status-registered-deep text-paper",
  "not-relevant": "bg-status-irrelevant text-ink",
};

interface LeadsKanbanProps {
  /** The open leads (every status but not-relevant) for the board's day and filters. */
  open: SettledLeads;
  /** The not-relevant ones, folded into the last column. */
  closed: SettledLeads;
  selectedId?: string;
  leadHref: (id: string) => string;
  /** Whether the signed-in person may change statuses: only then do cards drag between columns. */
  canMove?: boolean;
  /** A card was dropped on another column: the lead, and the status that column gives it. */
  onMove?: (lead: Lead, status: SettableLeadStatus) => void;
}

/**
 * Whether the page has scrolled as far as it goes, which brings the whole board into view. Until then the columns stay
 * still and the wheel moves the page, so a column can't catch the wheel with the board half below the fold. Without a
 * page to watch, the columns just scroll.
 */
function useBoardInView() {
  const [inView, setInView] = useState(true);
  const boardRef = useCallback((board: HTMLElement | null) => {
    const page = board?.closest<HTMLElement>(".overflow-y-auto");
    const content = board?.parentElement;
    if (!page || !content) return;
    const check = () => setInView(page.scrollHeight - page.clientHeight - page.scrollTop < 2);
    check();
    page.addEventListener("scroll", check, { passive: true });
    const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    sizes?.observe(page);
    sizes?.observe(content);
    return () => {
      page.removeEventListener("scroll", check);
      sizes?.disconnect();
    };
  }, []);
  return { boardRef, inView };
}

/**
 * The leads by status, one column each: new, in progress (talking or details sent, told apart by a tag), no answer
 * and registered; the not-relevant ones fold into a narrow last column. A card opens the lead. People who may change
 * statuses drag a card to another column, the folded one too, to give it that column's status; the CRM saves it and
 * Monday's label follows. A long column scrolls inside itself, under its heading, so however many leads there are the
 * board fits the view. Cards cascade in as the page opens; a lead whose status changed fades out of its old column and
 * rises into the new one.
 */
export function LeadsKanban({ open, closed, selectedId, leadHref, canMove = false, onMove }: LeadsKanbanProps) {
  const { leadsCopy: copy } = useCopy();
  const [showClosed, setShowClosed] = useState(false);
  const [dragged, setDragged] = useState<Lead | null>(null);
  const droppedAt = useRef(0);
  const justDropped = useCallback(() => Date.now() - droppedAt.current < DROP_CLICK_MS, []);
  const { boardRef, inView } = useBoardInView();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }));

  if (open.isError || closed.isError) {
    const retry = () => {
      void open.refetch();
      void closed.refetch();
    };
    return (
      <Surface variant="glass" aria-label={copy.board.label}>
        <ErrorState onRetry={retry} />
      </Surface>
    );
  }
  if (!open.data || !closed.data) return <KanbanSkeleton />;

  const board = boardLeads(open.data, closed.data);
  const leadOf = (id: string | number) =>
    Object.values(board)
      .flat()
      .find((lead) => lead.id === String(id));
  const nameOf = (id: string | number) => leadOf(id)?.name ?? "";
  const columnName = (id: string | number) => copy.board.columns[String(id) as DropTarget];
  const announcements: Announcements = {
    onDragStart: ({ active }) => copy.board.drag.pickedUp(nameOf(active.id)),
    onDragOver: ({ over }) => (over ? copy.board.drag.over(columnName(over.id)) : undefined),
    onDragEnd: ({ active, over }) => (over ? copy.board.drag.dropped(nameOf(active.id), columnName(over.id)) : copy.board.drag.cancelled(nameOf(active.id))),
    onDragCancel: ({ active }) => copy.board.drag.cancelled(nameOf(active.id)),
  };
  const startDrag = ({ active }: DragStartEvent) => setDragged(leadOf(active.id) ?? null);
  const endDrag = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    droppedAt.current = Date.now();
    const move = moveFor(board, String(active.id), over ? String(over.id) : null);
    if (move) onMove?.(move.lead, move.status);
  };
  const cancelDrag = () => {
    setDragged(null);
    droppedAt.current = Date.now();
  };
  const column = (target: DropTarget, footer?: ReactNode) => (
    <BoardColumn
      key={target}
      target={target}
      name={copy.board.columns[target]}
      headClass={HEAD_CLASS[target]}
      leads={board[target]}
      selectedId={selectedId}
      leadHref={leadHref}
      scrolls={inView}
      canMove={canMove}
      justDropped={justDropped}
      footer={footer}
    />
  );

  return (
    <DndContext sensors={sensors} onDragStart={startDrag} onDragEnd={endDrag} onDragCancel={cancelDrag} accessibility={{ announcements }}>
      <section
        ref={boardRef}
        aria-label={copy.board.label}
        aria-busy={open.isUpdating || closed.isUpdating || undefined}
        className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
      >
        <div className={cx("grid items-start gap-4", showClosed ? "min-w-[1240px] grid-cols-5" : "min-w-[1150px] grid-cols-[repeat(4,minmax(0,1fr))_11rem]")}>
          {BOARD_COLUMNS.map(({ key }) => column(key))}
          {showClosed ? (
            column("not-relevant", <ColumnButton onClick={() => setShowClosed(false)}>{copy.board.hideCards}</ColumnButton>)
          ) : (
            <FoldedColumn count={board["not-relevant"].length} canMove={canMove} onShow={() => setShowClosed(true)} />
          )}
        </div>
      </section>
      {/* No drop animation: the card itself moves into its new column with the board's own motion. */}
      <DragOverlay dropAnimation={null}>{dragged ? <DraggedCard lead={dragged} /> : null}</DragOverlay>
    </DndContext>
  );
}

interface BoardColumnProps {
  /** Which column: the status a card dropped here gets. */
  target: DropTarget;
  name: string;
  headClass: string;
  leads: Lead[];
  selectedId?: string;
  leadHref: (id: string) => string;
  /** Whether the cards scroll now; see useBoardInView. */
  scrolls: boolean;
  canMove: boolean;
  justDropped: () => boolean;
  footer?: ReactNode;
}

function BoardColumn({ target, name, headClass, leads, selectedId, leadHref, scrolls, canMove, justDropped, footer }: BoardColumnProps) {
  const { leadsCopy: copy } = useCopy();
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: target, disabled: !canMove });
  const shown = expanded ? leads : leads.slice(0, CARD_LIMIT);
  const isFirst = useFirstKeys(leads.map((lead) => lead.id));
  return (
    // At its tallest, with the page scrolled to its end, the column fits between the top bar and the page's bottom edge.
    <motion.section
      ref={setNodeRef}
      variants={cardVariants}
      aria-labelledby={headingId}
      className={cx(
        "surface-glass flex max-h-[calc(100dvh-10rem)] min-w-0 flex-col gap-2.5 overflow-hidden rounded-card p-2.5",
        isOver ? DROP_HIGHLIGHT : "",
      )}
    >
      <ColumnHeading id={headingId} name={name} count={leads.length} headClass={headClass} />
      {/* The list reaches the column's edges, so cards pass under the heading and their shadows aren't cut off. */}
      <motion.ul
        layoutScroll
        className={cx(
          "no-scrollbar relative -mx-2.5 -mt-2.5 flex min-h-0 flex-col gap-2.5 px-2.5 pt-2.5 pb-1 empty:hidden last:-mb-2.5 last:pb-2.5",
          scrolls ? "overflow-y-auto" : "overflow-y-hidden",
        )}
      >
        <AnimatePresence mode="popLayout">
          {shown.map((lead, index) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              selected={lead.id === selectedId}
              href={leadHref(lead.id)}
              row={{ index, cascade: isFirst(lead.id) }}
              canMove={canMove}
              justDropped={justDropped}
            />
          ))}
        </AnimatePresence>
      </motion.ul>
      {leads.length === 0 ? <p className="px-2 pb-2 text-caption text-mute">{copy.board.empty}</p> : null}
      {leads.length > shown.length ? <ColumnButton onClick={() => setExpanded(true)}>{copy.board.more(leads.length - shown.length)}</ColumnButton> : null}
      {footer}
    </motion.section>
  );
}

function ColumnHeading({ id, name, count, headClass }: { id: string; name: string; count: number; headClass: string }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <h3 id={id} className={cx("flex h-[42px] shrink-0 items-center gap-2 rounded-2xl px-3.5 text-[15px] font-medium", headClass)}>
      <span className="min-w-0 truncate">{name}</span>
      <span className="ms-auto inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-paper/30 px-2 text-caption tabular-nums">
        <span aria-hidden="true">{formatNumber(count)}</span>
        <span className="sr-only">{copy.leadCount(count)}</span>
      </span>
    </h3>
  );
}

/** The not-relevant leads, folded to a count until asked for. A card dropped here becomes not relevant. */
function FoldedColumn({ count, canMove, onShow }: { count: number; canMove: boolean; onShow: () => void }) {
  const { leadsCopy: copy } = useCopy();
  const headingId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: "not-relevant", disabled: !canMove });
  return (
    <motion.section
      ref={setNodeRef}
      variants={cardVariants}
      aria-labelledby={headingId}
      className={cx("surface-glass flex min-w-0 flex-col gap-2.5 rounded-card p-2.5", isOver ? DROP_HIGHLIGHT : "")}
    >
      <ColumnHeading id={headingId} name={copy.board.columns["not-relevant"]} count={count} headClass={HEAD_CLASS["not-relevant"]} />
      {count > 0 ? <ColumnButton onClick={onShow}>{copy.board.showCards}</ColumnButton> : <p className="px-2 pb-2 text-caption text-mute">{copy.board.empty}</p>}
    </motion.section>
  );
}

function ColumnButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 shrink-0 rounded-[14px] border border-dashed border-status-irrelevant text-small text-copy transition-colors hover:bg-paper/70"
    >
      {children}
    </button>
  );
}

/** What a card says under the status: in talks or details sent, or how many calls went unanswered. */
function cardTag(lead: Lead, copy: ReturnType<typeof useCopy>["leadsCopy"]): { tone: StatusTone; text: string } | null {
  if (lead.status === "talking") return { tone: "talking", text: copy.status.talking };
  if (lead.status === "details-sent") return { tone: "sent", text: copy.status["details-sent"] };
  if (lead.status === "no-answer" && lead.calls > 0) return { tone: "warning", text: copy.board.attempts(lead.calls) };
  return null;
}

interface LeadCardProps {
  lead: Lead;
  selected: boolean;
  href: string;
  row: RowMotion;
  canMove: boolean;
  justDropped: () => boolean;
}

function LeadCard({ lead, selected, href, row, canMove, justDropped }: LeadCardProps) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: lead.id, disabled: !canMove });
  const tag = cardTag(lead, copy);
  const openUnlessDropped = (event: MouseEvent<HTMLAnchorElement>) => {
    if (justDropped()) event.preventDefault();
  };
  return (
    <motion.li
      ref={setNodeRef}
      {...(canMove ? listeners : undefined)}
      data-draggable={canMove || undefined}
      layout="position"
      variants={rowVariants}
      custom={row}
      exit="exit"
      transition={{ layout: springs.surface }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: CARD_PRESS_SCALE }}
      className={cx(
        "lift-shadow relative rounded-inner p-3.5 shadow-card transition-[background-color,opacity]",
        selected ? "bg-cream ring-1 ring-ink/15 ring-inset" : "bg-paper",
        isDragging ? "opacity-40" : "",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        {/* The name's link covers the card, so a click anywhere opens the lead; the contact buttons sit above it. */}
        <Link
          to={href}
          draggable={false}
          onClick={openUnlessDropped}
          aria-current={selected ? "page" : undefined}
          className="min-w-0 font-medium break-words text-ink after:absolute after:inset-0 after:rounded-inner"
        >
          {lead.name}
        </Link>
        <span className="shrink-0 text-caption text-mute">{formatDayMonth(dayAt(arrivedOn(lead)), locale)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {lead.service ? <Chip>{copy.services[lead.service]}</Chip> : null}
        <Chip>{copy.sources[lead.source]}</Chip>
        {lead.archived ? <Chip>{copy.archived}</Chip> : null}
      </div>
      {tag ? (
        <div className="mt-2">
          <StatusTag tone={tag.tone}>{tag.text}</StatusTag>
        </div>
      ) : null}
      <div className="relative z-10 mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="text-small text-copy">
          <Ltr>{lead.phone}</Ltr>
        </span>
        <span className="flex gap-1.5">
          <ContactLink href={whatsappHref(lead.phone)} icon="chat" label={copy.board.whatsapp(lead.name)} newTab />
          <ContactLink href={telHref(lead.phone)} icon="phone" label={copy.board.call(lead.name)} />
        </span>
      </div>
    </motion.li>
  );
}

/** The card under the pointer while it's dragged: lifted and tilted a little, without its links. */
function DraggedCard({ lead }: { lead: Lead }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  return (
    <div className="pointer-events-none w-full rotate-[1.5deg] rounded-inner bg-paper p-3.5 shadow-float ring-1 ring-ink/10">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 font-medium break-words text-ink">{lead.name}</span>
        <span className="shrink-0 text-caption text-mute">{formatDayMonth(dayAt(arrivedOn(lead)), locale)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {lead.service ? <Chip>{copy.services[lead.service]}</Chip> : null}
        <Chip>{copy.sources[lead.source]}</Chip>
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-sand-light px-2.5 py-0.5 text-caption text-copy">{children}</span>;
}

function ContactLink({ href, icon, label, newTab = false }: { href: string; icon: IconName; label: string; newTab?: boolean }) {
  return (
    <a
      href={href}
      aria-label={label}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      className="inline-flex size-10 items-center justify-center rounded-full bg-sand-light text-ink transition-colors hover:bg-cream"
    >
      <Icon name={icon} size={16} />
    </a>
  );
}

/** Five columns of card outlines. */
function KanbanSkeleton() {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className="-mx-1 overflow-hidden px-1">
      <span className="sr-only">{states.loading}</span>
      <div aria-hidden="true" className="grid min-w-[1150px] grid-cols-[repeat(4,minmax(0,1fr))_11rem] items-start gap-4">
        {[3, 2, 2, 1, 0].map((cards, column) => (
          <div key={column} className="surface-glass flex flex-col gap-2.5 rounded-card p-2.5">
            <Skeleton className="h-[42px] w-full rounded-2xl" />
            {Array.from({ length: cards }, (_, card) => (
              <div key={card} className="flex flex-col gap-2 rounded-inner bg-paper p-3.5 shadow-card">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Connect the page**

In `dashboard/src/screens/leads/LeadsDesktopPage.tsx`:

1. Change the import `import { useLeadCounts, useOverview } from "../../data/queries";` to:

```ts
import { useCan, useLeadCounts, useOverview } from "../../data/queries";
```

2. Add after the `import { useSettledLeads } from "./leads-data";` line:

```ts
import { useChangeLeadStatus } from "./useChangeLeadStatus";
```

3. In `LeadsDesktopPage`, after `const overview = useOverview();`, add:

```ts
  const canMove = useCan("leads", "full");
  const changeStatus = useChangeLeadStatus();
```

4. Replace the last element, `<LeadsKanban open={open} closed={closed} selectedId={leadId} leadHref={url.leadHref} />`, with:

```tsx
      <LeadsKanban open={open} closed={closed} selectedId={leadId} leadHref={url.leadHref} canMove={canMove} onMove={changeStatus} />
```

- [ ] **Step 7: Run the tests to see them pass, then everything**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/screens/leads && npm run check`
Expected: PASS. `npm run check` is typecheck, lint and every test.

- [ ] **Step 8: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add dashboard/package.json dashboard/package-lock.json dashboard/src/content/leads.he.ts dashboard/src/content/leads.en.ts dashboard/src/screens/leads
git commit -m "feat(dashboard): drag a lead to another column to change its status" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: A press outside the open lead closes it

**Files:**
- Create: `dashboard/src/screens/leads/useCloseOnOutsidePress.ts`
- Modify: `dashboard/src/screens/leads/LeadsDesktopPage.tsx`
- Modify: `dashboard/src/ui/Toast.tsx` (one attribute)
- Test: `dashboard/src/screens/leads/useCloseOnOutsidePress.test.tsx`

**Interfaces:**
- Produces: `useCloseOnOutsidePress(ref: RefObject<HTMLElement | null>, onClose: () => void, active: boolean): void`, and
  `data-toast` on every toast.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/screens/leads/useCloseOnOutsidePress.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useCloseOnOutsidePress } from "./useCloseOnOutsidePress";

function Harness({ onClose, active = true }: { onClose: () => void; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnOutsidePress(ref, onClose, active);
  return (
    <div>
      <div ref={ref}>
        <button type="button">inside</button>
      </div>
      <button type="button">outside</button>
      <a href="/leads/other?day=2026-11-20">another lead</a>
      <div role="listbox">
        <span>menu option</span>
      </div>
      <div data-toast="">
        <button type="button">toast button</button>
      </div>
    </div>
  );
}

describe("useCloseOnOutsidePress", () => {
  it("closes on a main-button press outside, and on nothing else", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    for (const text of ["inside", "another lead", "menu option", "toast button"]) fireEvent.pointerDown(screen.getByText(text), { button: 0 });
    fireEvent.pointerDown(screen.getByText("outside"), { button: 2 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText("outside"), { button: 0 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing while no lead is open", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} active={false} />);
    fireEvent.pointerDown(screen.getByText("outside"), { button: 0 });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/screens/leads/useCloseOnOutsidePress.test.tsx`
Expected: FAIL. `./useCloseOnOutsidePress` can't be resolved.

- [ ] **Step 3: Write the hook**

Create `dashboard/src/screens/leads/useCloseOnOutsidePress.ts`:

```ts
import { useEffect, type RefObject } from "react";

/**
 * Presses that never close the panel:
 * - another lead's card, which opens that lead instead (and starts a drag on the board);
 * - menus, pop-ups, dialogs and toasts, which float above the page.
 */
const KEEPS_OPEN = 'a[href^="/leads/"], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [popover], [data-toast]';

/** While `active`, a main-button press anywhere outside `ref` calls `onClose`. */
export function useCloseOnOutsidePress(ref: RefObject<HTMLElement | null>, onClose: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const press = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (ref.current?.contains(event.target) || event.target.closest(KEEPS_OPEN)) return;
      onClose();
    };
    document.addEventListener("pointerdown", press);
    return () => document.removeEventListener("pointerdown", press);
  }, [ref, onClose, active]);
}
```

- [ ] **Step 4: Mark toasts**

In `dashboard/src/ui/Toast.tsx`, on the toast's own root `<div` (the one with `onPointerEnter={() => setPaused(true)}`),
add the attribute `data-toast=""` as its first prop:

```tsx
    <div
      data-toast=""
      onPointerEnter={() => setPaused(true)}
```

- [ ] **Step 5: Use it on the leads page**

In `dashboard/src/screens/leads/LeadsDesktopPage.tsx`:

1. Change `import { useCallback } from "react";` to `import { useCallback, useRef } from "react";`.
2. Add after the `useChangeLeadStatus` import:

```ts
import { useCloseOnOutsidePress } from "./useCloseOnOutsidePress";
```

3. After the existing `closePanel` callback, add:

```ts
  // A press outside the panel closes it too, leaving the focus where the press put it.
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissPanel = useCallback(() => {
    navigate(listHref);
  }, [listHref, navigate]);
  useCloseOnOutsidePress(panelRef, dismissPanel, Boolean(leadId));
```

4. Change `<div className="absolute end-0 top-0 w-[400px] max-w-full">` to:

```tsx
        <div ref={panelRef} className="absolute end-0 top-0 w-[400px] max-w-full">
```

5. Replace the last line of the component's doc comment, `* A lead opens in a panel that floats over the board and stays in view while the page scrolls.`, with:

```ts
 * A lead opens in a panel that floats over the board and stays in view while the page scrolls; a press outside it closes it.
```

- [ ] **Step 6: Run the test to see it pass, then everything**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vitest run src/screens/leads/useCloseOnOutsidePress.test.tsx && npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /d/work/Ronit-Project-lead-status
git add dashboard/src/screens/leads/useCloseOnOutsidePress.ts dashboard/src/screens/leads/useCloseOnOutsidePress.test.tsx dashboard/src/screens/leads/LeadsDesktopPage.tsx dashboard/src/ui/Toast.tsx
git commit -m "feat(dashboard): a press outside the open lead closes it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full checks, and a look in a real browser on the demo data

**Files:**
- Create, never committed (`.git/info/exclude` already lists both paths):
  - `dashboard/vite.demo.config.ts`
  - `dashboard/src/demo-services.ts`
- Create in the session scratchpad: `C:/Users/ACERNI~1/AppData/Local/Temp/claude/6162e4edb21f8feb/1cfc04dd-348e-4b0d-be99-073a6877713d/scratchpad/board-check.cjs`

- [ ] **Step 1: Every server check**

Run: `cd /d/work/Ronit-Project-lead-status/Server && npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 2: Every dashboard check, and the production build**

Run: `cd /d/work/Ronit-Project-lead-status/dashboard && npm run check && npm run build`
Expected: all pass, and `dist/` is built.

- [ ] **Step 3: Set up the local demo**

Create `dashboard/vite.demo.config.ts`:

```ts
// Local demo only, never committed (listed in .git/info/exclude): the dashboard on the demo account's made-up data,
// signed in, with no API. Runs on its own port.
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, {
  resolve: {
    alias: [{ find: /^.*\/data\/createServices$/, replacement: fileURLToPath(new URL("./src/demo-services.ts", import.meta.url)) }],
  },
});
```

Create `dashboard/src/demo-services.ts`:

```ts
// Local demo only, never committed (listed in .git/info/exclude): the test services' signed-in session, with the
// demo account's made-up data. vite.demo.config.ts swaps it in for data/createServices.
import { createDemoServices } from "./data/demo/demoServices";
import type { Services } from "./data/services";
import { createTestServices } from "./test/services";

export function createServices(): Services {
  const me = { id: "demo-user", name: "חשבון הדגמה", initial: "ח", role: "admin" as const, passportAccess: true, demo: true };
  return { ...createTestServices({ signedIn: true }), ...createDemoServices(me) };
}
```

Then confirm git ignores both:
Run: `cd /d/work/Ronit-Project-lead-status && git status --short dashboard/vite.demo.config.ts dashboard/src/demo-services.ts`
Expected: no output.

- [ ] **Step 4: Start it**

Run in the background: `cd /d/work/Ronit-Project-lead-status/dashboard && npx vite --config vite.demo.config.ts --port 5181 --strictPort`
Expected: "Local: http://localhost:5181/".

- [ ] **Step 5: Drive it in headless Chrome**

Create `C:/Users/ACERNI~1/AppData/Local/Temp/claude/6162e4edb21f8feb/1cfc04dd-348e-4b0d-be99-073a6877713d/scratchpad/board-check.cjs`:

```js
// Drags a demo card from New to No answer, changes a status from the lead's menu, and checks that a press outside
// closes the lead. Screenshots go next to this file. Headless only.
const path = require("node:path");
const { createRequire } = require("node:module");
const { chromium } = createRequire("D:/work/Ronit-Project-lead-status/dashboard/package.json")("@playwright/test");

const shot = (name) => path.join(__dirname, `board-${name}.png`);
const day = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10); // the 14-lead day

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, locale: "he-IL", timezoneId: "Asia/Jerusalem" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://localhost:5181/leads?day=${day}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-draggable="true"]');
  // Columns are found inside the board only, by their heading's exact name.
  const board = page.getByRole("region", { name: "לוח לידים לפי סטטוס" });
  const column = (name) => board.locator("section[aria-labelledby]").filter({ has: page.getByText(name, { exact: true }) }).first();
  const count = async (name) => Number((await column(name).locator("h3 span[aria-hidden]").first().innerText()).trim());

  const before = { fresh: await count("חדש"), noAnswer: await count("אין מענה") };
  const card = column("חדש").locator('[data-draggable="true"]').first();
  const name = (await card.locator("a").first().innerText()).trim();
  const from = await card.boundingBox();
  const to = await column("אין מענה").boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 12 });
  await page.screenshot({ path: shot("1-dragging") });
  await page.mouse.up();
  await page.waitForTimeout(900);
  await page.screenshot({ path: shot("2-dropped") });
  const after = { fresh: await count("חדש"), noAnswer: await count("אין מענה") };
  const moved = await column("אין מענה").getByText(name, { exact: true }).count();
  console.log("drag:", JSON.stringify({ name, before, after, inNoAnswer: moved > 0 }), "| url after drop:", new URL(page.url()).pathname);

  await column("אין מענה").getByText(name, { exact: true }).click();
  const menu = page.getByRole("combobox", { name: "שינוי סטטוס" });
  await menu.waitFor();
  await menu.selectOption("working");
  await page.waitForTimeout(900);
  console.log("menu: value now", await menu.inputValue(), "| in In progress:", (await column("בטיפול").getByText(name, { exact: true }).count()) > 0);
  await page.screenshot({ path: shot("3-menu") });

  // The page's title sits on the start side; in Hebrew the panel floats on the other (left) side.
  await page.locator("main h1").first().click();
  await page.waitForTimeout(700);
  console.log("outside press closed the lead:", new URL(page.url()).pathname === "/leads", "| page errors:", errors.length ? errors : "none");
  await page.screenshot({ path: shot("4-closed") });
  await browser.close();
})();
```

Run: `node "C:/Users/ACERNI~1/AppData/Local/Temp/claude/6162e4edb21f8feb/1cfc04dd-348e-4b0d-be99-073a6877713d/scratchpad/board-check.cjs"`
Expected:
- `drag:` shows New one lower, No answer one higher, `inNoAnswer: true`, and the address still `/leads`;
- `menu: value now working | in In progress: true`;
- `outside press closed the lead: true | page errors: none`.

Then look at the four screenshots. Check that the dragged card is lifted, the target column is outlined in gold, and
the card has landed in its new column.

- [ ] **Step 6: Stop the demo**

Stop the background Vite process. Leave the two local demo files: git ignores them.

---

### Task 12: Hand-off. Ask the user before pushing anything.

- [ ] **Step 1: Summarize for the user, then ask whether to push the branch and open the pull request**

Give the user:
- what was built;
- the test counts;
- the screenshots from Task 11.

The pull request targets `faphetS/Ronit-Project` from `feat/lead-status-drag`, pushed with the TheSuperShyy login as
before. Its body lists the five server units, the dashboard changes, migration 009, and the note that the
passport-bot branch's migration becomes 010. It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 2: On the user's OK, push and open the pull request, then run a security review of it**

Fix anything real the review finds, with a test for each fix, and push again.

- [ ] **Step 3: Only on the user's "push live", follow the spec's rollout**

1. **On the new server:** a database backup and a rollback image first. Then pull, migrate to 009 and rebuild the crm.
2. **The dashboard:** Vercel production.
3. **Check it live:** sign in as the demo account in headless Chrome, and repeat Task 11's drag, menu and outside-press
   checks.
4. **One real Monday write, only with the user's OK:** change one real lead's label and change it back.
