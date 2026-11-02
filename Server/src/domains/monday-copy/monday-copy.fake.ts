import type { Gql } from "./monday-copy.reader.js";

/**
 * For tests only: a fake Monday account (a CRM board, the old CRM board, a flight and a challah
 * board) that answers the copy's queries, two rows and 100 notes a page, so paging is exercised.
 */

export interface FakeRow {
  id: string;
  name: string;
  group: string;
  created: string;
  updated: string;
  values: Record<string, string>;
}

export interface FakeBoard {
  id: string;
  name: string;
  columns: Array<{ id: string; title: string }>;
  groups: Array<{ id: string; title: string }>;
  rows: FakeRow[];
  notes: Array<{ id: string; item_id: string; created_at: string; text_body: string; creator: { name: string } }>;
}

export const CRM = "5101856136";
export const ARCHIVE = "5094895163";
export const FLIGHT = "5097312406";
export const CHALLAH = "5095155077";

const CRM_COLUMNS = [
  { id: "phone", title: "מספר טלפון" },
  { id: "service", title: "שירות" },
  { id: "ig", title: "הודעה אחרונה באינסטגרם" },
  { id: "contact", title: "נוצר קשר" },
  { id: "source", title: "מקור ליד" },
];

export function fakeAccount(): FakeBoard[] {
  return [
    {
      id: CRM,
      name: "רונית  - CRM",
      columns: CRM_COLUMNS,
      groups: [
        { id: "g_new", title: "לידים חדשים אורטל" },
        { id: "g_nophone", title: "ללא מספרי טלפון" },
      ],
      rows: [
        { id: "101", name: "יעל פרץ", group: "g_new", created: "2026-10-28T08:00:00Z", updated: "2026-10-28T09:00:00Z", values: { phone: "0542212219", service: "טיסות לאומן", ig: "היי", contact: "נוצר קשר", source: "אורגני" } },
        { id: "102", name: "noa.b", group: "g_nophone", created: "2026-10-29T08:00:00Z", updated: "2026-10-29T08:00:00Z", values: { ig: "כמה עולה?", source: "אורגני" } },
        { id: "103", name: "שירה כהן", group: "g_new", created: "2026-10-30T08:00:00Z", updated: "2026-10-30T08:00:00Z", values: { phone: "+972501112233", source: "ממומן" } },
      ],
      notes: [
        { id: "n2", item_id: "101", created_at: "2026-10-29T10:00:00Z", text_body: "שלחתי לה את המסלול", creator: { name: "Ronit" } },
        { id: "n1", item_id: "101", created_at: "2026-10-28T10:00:00Z", text_body: "אין מענה, לחזור מחר", creator: { name: "Ronit" } },
        // Monday's board feed also returns notes of rows deleted or moved off the board.
        { id: "n0", item_id: "555", created_at: "2026-10-20T10:00:00Z", text_body: "ליד שנסגר ועבר לטיסה", creator: { name: "Ronit" } },
      ],
    },
    {
      id: ARCHIVE,
      name: "רונית -CRM ישן",
      columns: CRM_COLUMNS,
      groups: [{ id: "g_old", title: "פולו אפ טו באב 2026" }],
      rows: [{ id: "91", name: "רחל לוי", group: "g_old", created: "2026-06-01T08:00:00Z", updated: "2026-07-01T08:00:00Z", values: { phone: "0529998877" } }],
      notes: [],
    },
    {
      id: FLIGHT,
      name: "טיסה טו באב 26",
      columns: [
        { id: "phone_f", title: "טלפון" },
        { id: "status_f", title: "סטטוס" },
        { id: "passport_f", title: "דרכון" },
        { id: "room_f", title: "חדר" },
      ],
      groups: [{ id: "g_trip", title: 'ט"ו באב אומן' }],
      rows: [
        // The same phone as lead 103: one customer, with the lead's source.
        { id: "201", name: "שירה כהן", group: "g_trip", created: "2026-07-01T08:00:00Z", updated: "2026-10-01T08:00:00Z", values: { phone_f: "0501112233", status_f: "נסגר", passport_f: "יש", room_f: "לבד" } },
        { id: "202", name: "מרים דוק", group: "g_trip", created: "2026-07-02T08:00:00Z", updated: "2026-07-02T08:00:00Z", values: { status_f: "צוות" } },
      ],
      notes: [],
    },
    {
      id: CHALLAH,
      name: "הפרשות חלה 26",
      columns: [
        { id: "phone_c", title: "טלפון" },
        { id: "date_c", title: "תאריך" },
        { id: "type_c", title: "סוג האירוע" },
        { id: "city_c", title: "עיר" },
      ],
      groups: [
        { id: "g_nov", title: "נובמבר 2026" },
        { id: "g_cancel", title: "ביטולים" },
      ],
      rows: [
        // The same woman as on the flight: still one customer.
        { id: "301", name: "שירה כהן", group: "g_nov", created: "2026-09-01T08:00:00Z", updated: "2026-09-01T08:00:00Z", values: { phone_c: "+972501112233", date_c: "2026-11-10", type_c: "הפרשת חלה", city_c: "דימונה" } },
        { id: "302", name: "לאה ברגר", group: "g_cancel", created: "2026-09-02T08:00:00Z", updated: "2026-09-02T08:00:00Z", values: { phone_c: "0549981120" } },
      ],
      notes: [],
    },
    { id: "999", name: "משימות שיווק", columns: [], groups: [], rows: [], notes: [] },
  ];
}

export interface FakeMonday {
  gql: Gql;
  boards: FakeBoard[];
  calls: string[];
  /** Throws on every call from now on. */
  fail?: Error;
}

/** Answers the reader's five queries from `boards`, 2 rows and 1 note per page to exercise paging. */
export function fakeMonday(boards: FakeBoard[]): FakeMonday {
  const fake: FakeMonday = { boards, calls: [], gql: undefined as unknown as Gql };
  const rowJson = (row: FakeRow) => ({
    id: row.id,
    name: row.name,
    created_at: row.created,
    updated_at: row.updated,
    group: { id: row.group },
    column_values: Object.entries(row.values).map(([id, text]) => ({ id, text })),
  });
  const page = (board: FakeBoard, start: number) => ({
    cursor: start + 2 < board.rows.length ? `${board.id}:${start + 2}` : null,
    items: board.rows.slice(start, start + 2).map(rowJson),
  });
  fake.gql = (async (query: string, variables: Record<string, unknown> = {}) => {
    if (fake.fail) throw fake.fail;
    const find = (id: unknown) => fake.boards.find((board) => board.id === String(id));
    if (query.includes("state: active")) {
      fake.calls.push("list");
      return {
        boards: [
          ...fake.boards.map((board) => ({ id: board.id, name: board.name, type: "board", updated_at: "2026-05-28T00:00:00Z", items_count: board.rows.length })),
          { id: "777", name: "Subitems of רונית - CRM", type: "sub_items_board", updated_at: null, items_count: 0 },
        ],
      };
    }
    if (query.includes("columns {")) {
      fake.calls.push("structure");
      return { boards: (variables.ids as string[]).map(find).filter(Boolean).map((board) => ({ id: board!.id, columns: board!.columns, groups: board!.groups })) };
    }
    if (query.includes("next_items_page")) {
      fake.calls.push("rows");
      const [id, start] = String(variables.cursor).split(":");
      return { next_items_page: page(find(id)!, Number(start)) };
    }
    if (query.includes("items_page")) {
      fake.calls.push("rows");
      return { boards: [{ items_page: page(find((variables.ids as string[])[0])!, 0) }] };
    }
    if (query.includes("items(ids:")) {
      fake.calls.push("row-notes");
      const wanted = new Set((variables.ids as string[]).map(String));
      const notes = fake.boards.flatMap((board) => board.notes).filter((note) => wanted.has(note.item_id));
      return {
        items: [...wanted].map((id) => ({ id, updates: notes.filter((note) => note.item_id === id) })).filter((item) => fake.boards.some((board) => board.rows.some((row) => row.id === item.id))),
      };
    }
    if (query.includes("updates(")) {
      fake.calls.push("notes");
      const board = find((variables.ids as string[])[0])!;
      const pageNo = Number(variables.page);
      return { boards: [{ updates: board.notes.slice((pageNo - 1) * 100, pageNo * 100) }] };
    }
    throw new Error(`unexpected query: ${query}`);
  }) as Gql;
  return fake;
}
