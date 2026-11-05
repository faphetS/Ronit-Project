import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import { formLabel, leadNoteHtml } from "./lead-sheet.note.js";
import { localPhone, parseCsv, sheetLeads, type SheetLead } from "./lead-sheet.parse.js";
import { forEachSheet, SETTLE_MS, syncLeadSheet, type LeadSheetDeps } from "./lead-sheet.service.js";

const HEADER = [
  "id",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "form_name",
  "is_organic",
  "platform",
  'העלות_הכוללת_של_המסע_היא_5,500_ש"ח._האם_זה_רלוונטי_עבורך?',
  "הטיסה_שלנו_תצא_ב-6/12/2026_ותחזור_ב-10/12/2026._האם_התאריכים_האלו_מתאימים_לך?",
  "full_name",
  "phone_number",
  "email",
  "inbox_url",
  "lead_status",
];

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const csv = (rows: string[][]) => [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

function metaRow(id: string, created: string, platform: string, name: string, phone: string, email = "a@example.com", organic = "false"): string[] {
  return [id, created, "ad", "Ad", "set", "Set", "camp", "Campaign", "form", "שאלון חנוכה -0.1-copy", organic, platform, "כן", "כן", name, phone, email, "", "CREATED"];
}

describe("reading the sheet", () => {
  it("reads quoted CSV: commas, doubled quotes, line breaks, CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,y,z,w\r\n')).toEqual([
      ["a", "b, c", 'say "hi"', "two\nlines"],
      ["x", "y", "z", "w"],
    ]);
  });

  it("makes leads of Meta's rows: id, time, platform, the form's questions and answers, a local phone", () => {
    const leads = sheetLeads(
      csv([
        metaRow("l:111", "2026-10-29T21:33:09+02:00", "fb", "שרה  כהן", "+972521234567"),
        metaRow("222", "2026-11-03T17:40:17-05:00", "ig", "רחל לוי", "p:0539876543", "", "true"),
        ["333", "2026-10-30T04:46:45-05:00", "", "", "", "", "", "", "form", "שאלון חנוכה -0.1-copy", "true", "", "<test lead: dummy data for x>", "<test lead: dummy data for y>", "<test lead: dummy data for full_name>", "", "test@meta.com", "", ""],
      ]),
    );
    expect(leads[0]).toEqual({
      leadId: "111",
      createdAt: new Date("2026-10-29T19:33:09Z"),
      platform: "fb",
      organic: false,
      formName: "שאלון חנוכה -0.1-copy",
      fullName: "שרה כהן",
      phone: "0521234567",
      email: "a@example.com",
      answers: [
        { question: 'העלות הכוללת של המסע היא 5,500 ש"ח. האם זה רלוונטי עבורך?', answer: "כן" },
        { question: "הטיסה שלנו תצא ב-6/12/2026 ותחזור ב-10/12/2026. האם התאריכים האלו מתאימים לך?", answer: "כן" },
      ],
      test: false,
    });
    expect(leads[1]).toMatchObject({ leadId: "222", createdAt: new Date("2026-11-03T22:40:17Z"), platform: "ig", organic: true, phone: "0539876543", email: null });
    expect(leads[2]).toMatchObject({ leadId: "333", test: true, phone: null });
  });

  it("reads every question between Meta's columns and the contact ones, however many the form asks", () => {
    const header = [...HEADER];
    header.splice(14, 0, "מה_גורם_לך_לרצות_להצטרף_למסע?");
    const row = metaRow("444", "2026-11-04T15:01:00-05:00", "fb", "A", "+972521111111");
    row.splice(14, 0, "אהבה");
    const [lead] = sheetLeads([header, row].map((cells) => cells.map(csvCell).join(",")).join("\r\n"));
    expect(lead.answers).toHaveLength(3);
    expect(lead.answers[2]).toEqual({ question: "מה גורם לך לרצות להצטרף למסע?", answer: "אהבה" });
    expect(lead).toMatchObject({ fullName: "A", phone: "0521111111" });
  });

  it("writes Israeli numbers as 05…, keeps others, and drops what isn't a number", () => {
    expect(localPhone("+972 52-123-4567")).toBe("0521234567");
    expect(localPhone("00972521234567")).toBe("0521234567");
    expect(localPhone("521234567")).toBe("0521234567");
    expect(localPhone("+1 845 555 0100")).toBe("18455550100");
    expect(localPhone("")).toBeNull();
  });
});

const LEAD: SheetLead = {
  leadId: "111",
  createdAt: new Date("2026-10-31T20:45:00Z"),
  platform: "fb",
  organic: false,
  formName: "שאלון חנוכה -0.1-copy",
  fullName: "שרה כהן",
  phone: "0521234567",
  email: "a@example.com",
  answers: [
    { question: "האם זה רלוונטי עבורך?", answer: "כן" },
    { question: "עיר", answer: "<ירושלים>" },
  ],
  test: false,
};

describe("the note", () => {
  it("says where she came from, when (Israel time), her answers, and her old card", () => {
    expect(formLabel("שאלון חנוכה -0.1-copy")).toBe("שאלון חנוכה");
    expect(formLabel("שאלון חנוכה -0.1-copy-copy")).toBe("שאלון חנוכה");
    expect(formLabel("Lead form")).toBe("Lead form");
    expect(leadNoteHtml(LEAD, { board: "רונית -CRM ישן", since: new Date("2026-06-15T16:33:00Z") })).toBe(
      '<div dir="rtl" style="text-align: right">' +
        [
          'נוסף מגיליון הלידים של מטא (טופס "שאלון חנוכה"), כי הליד לא הגיע למאנדיי.',
          "מילא/ה את הטופס בפייסבוק ב-31.10.2026 בשעה 22:45.",
          "האם זה רלוונטי עבורך? כן",
          "עיר: &lt;ירושלים&gt;",
          'פנייה חוזרת: יש כרטיס ישן בלוח "רונית -CRM ישן" מ-15.06.2026.',
        ].join("<br>") +
        "</div>",
    );
  });
});

describe("forEachSheet", () => {
  it("goes through every sheet, past one that fails, and reports that failure at the end", async () => {
    const ran: number[] = [];
    const unreadable = new Error("The lead sheet answered 404");
    await expect(
      forEachSheet(["first", "broken", "third"], async (url, sheet) => {
        ran.push(sheet);
        if (url === "broken") throw unreadable;
      }),
    ).rejects.toBe(unreadable);
    expect(ran).toEqual([1, 2, 3]);
  });

  it("stops at a Monday rate limit, since the next sheet would hit it too", async () => {
    const ran: number[] = [];
    await expect(
      forEachSheet(["first", "second"], async (_url, sheet) => {
        ran.push(sheet);
        throw new MondayRateLimitError("daily", 3600, "DAILY_LIMIT_EXCEEDED");
      }),
    ).rejects.toBeInstanceOf(MondayRateLimitError);
    expect(ran).toEqual([1]);
  });

  it("does nothing without sheets", async () => {
    await expect(forEachSheet([], async () => undefined)).resolves.toBeUndefined();
  });
});

describe("syncLeadSheet", () => {
  let db: TestDb;
  let handled: Set<string>;
  let created: SheetLead[];
  let notes: Array<{ itemId: string; html: string }>;
  let onMonday: Set<string>;
  const now = new Date("2026-11-04T10:00:00Z");

  beforeAll(async () => {
    db = await createTestDb();
  }, TEST_DB_TIMEOUT_MS);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    handled = new Set();
    created = [];
    notes = [];
    onMonday = new Set();
    await db.query("INSERT INTO monday_boards (id, name, kind) VALUES ('live', 'רונית  - CRM', 'crm'), ('old', 'רונית -CRM ישן', 'crm-archive')");
  });

  async function lead(itemId: string, phone: string, archived: boolean, createdAt = "2026-06-15T16:33:00Z") {
    await db.query(
      `INSERT INTO leads (monday_item_id, monday_board_id, monday_group, name, phone, status, source, archived, created_at, updated_at)
       VALUES ($1, $2, 'g', 'x', $3, 'new', 'instagram', $4, $5, $5)`,
      [itemId, archived ? "old" : "live", phone, archived, createdAt],
    );
  }

  function deps(rows: string[][], overrides: Partial<LeadSheetDeps["monday"]> = {}): LeadSheetDeps {
    return {
      fetchCsv: async () => csv(rows),
      db,
      monday: {
        findOnLiveBoard: async (phone) => (onMonday.has(phone) ? "monday-item" : null),
        createLead: async (l) => {
          created.push(l);
          return `item-${l.leadId}`;
        },
        addNote: async (itemId, html) => {
          notes.push({ itemId, html });
        },
        ...overrides,
      },
      handled: { has: (id) => handled.has(id), mark: (id) => void handled.add(id) },
      now: () => now,
    };
  }

  const hourAgo = "2026-11-04T09:00:00Z";

  it("adds only the leads Monday doesn't have, once, with a note; a returning person's note names her old card", async () => {
    await lead("1", "972521111111", false);
    await lead("2", "972523333333", true);
    onMonday.add("0522222222");
    handled.add("done");
    const rows = [
      metaRow("in-copy", hourAgo, "ig", "A", "+972521111111"),
      metaRow("in-monday", hourAgo, "ig", "B", "+972522222222"),
      metaRow("returning", hourAgo, "fb", "C", "+972523333333"),
      metaRow("new", hourAgo, "fb", "D", "+972524444444"),
      metaRow("no-phone", hourAgo, "fb", "E", ""),
      metaRow("done", hourAgo, "fb", "F", "+972525555555"),
      metaRow("too-new", "2026-11-04T09:50:00Z", "fb", "G", "+972526666666"),
    ];
    const result = await syncLeadSheet(deps(rows));
    expect(result).toEqual({
      leads: 7,
      added: [
        { leadId: "returning", itemId: "item-returning" },
        { leadId: "new", itemId: "item-new" },
      ],
      alreadyInMonday: 2,
      skipped: 1,
      waiting: 1,
    });
    expect(created.map((l) => l.fullName)).toEqual(["C", "D"]);
    expect(notes.map((n) => n.itemId)).toEqual(["item-returning", "item-new"]);
    expect(notes[0].html).toContain('פנייה חוזרת: יש כרטיס ישן בלוח "רונית -CRM ישן" מ-15.06.2026.');
    expect(notes[1].html).not.toContain("פנייה חוזרת");
    expect([...handled].sort()).toEqual(["done", "in-copy", "in-monday", "new", "no-phone", "returning"]);

    // The next run touches nothing it handled; the new lead waits until it settles.
    const later = await syncLeadSheet({ ...deps(rows), now: () => new Date(now.getTime() + SETTLE_MS) });
    expect(later).toMatchObject({ added: [{ leadId: "too-new" }], alreadyInMonday: 0 });
    expect(created).toHaveLength(3);
  });

  it("stops at a Monday rate limit, and the rest wait for the next run", async () => {
    const rows = [metaRow("first", hourAgo, "fb", "A", "+972521111111"), metaRow("second", hourAgo, "fb", "B", "+972522222222")];
    let calls = 0;
    const limited = deps(rows, {
      findOnLiveBoard: async () => {
        calls += 1;
        if (calls === 2) throw new MondayRateLimitError("daily", 3600, "DAILY_LIMIT_EXCEEDED");
        return null;
      },
    });
    await expect(syncLeadSheet(limited)).rejects.toBeInstanceOf(MondayRateLimitError);
    expect([...handled]).toEqual(["first"]);
    expect(created.map((l) => l.leadId)).toEqual(["first"]);
  });

  it("never adds a lead twice when only its note fails", async () => {
    const rows = [metaRow("only", hourAgo, "fb", "A", "+972521111111")];
    const result = await syncLeadSheet(
      deps(rows, {
        addNote: async () => {
          throw new Error("note failed");
        },
      }),
    );
    expect(result.added).toEqual([{ leadId: "only", itemId: "item-only" }]);
    expect(handled.has("only")).toBe(true);
  });
});
