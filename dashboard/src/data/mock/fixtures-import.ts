import type { ImportRun } from "../types";

// The Monday.com import, as on the Import board. Times are UTC; Israel is UTC+2 from 25.10.2026.

/** When the import finished: today at 08:40. */
export const IMPORT_RUN_AT = "2026-10-28T06:40:00.000Z";

/** Ronit's Monday.com boards, by the names she gave them. */
export const MONDAY_BOARDS = {
  crm: "CRM כללי",
  uman: "אומן",
  poland: "פולין",
  challah: "הפרשת חלה",
} as const;

export const IMPORT_RUN: ImportRun = {
  id: "imp-monday",
  status: "completed",
  startedAt: "2026-10-28T06:21:00.000Z",
  completedAt: IMPORT_RUN_AT,
  boards: [
    { id: "mb-crm", name: MONDAY_BOARDS.crm, groups: 8, items: 612, selected: true },
    { id: "mb-uman", name: MONDAY_BOARDS.uman, groups: 5, items: 341, selected: true },
    { id: "mb-poland", name: MONDAY_BOARDS.poland, groups: 3, items: 207, selected: true },
    { id: "mb-challah", name: MONDAY_BOARDS.challah, groups: 4, items: 161, selected: true },
  ],
  steps: [
    { key: "connect", state: "done", completedAt: "2026-10-27T12:10:00.000Z" },
    { key: "boards", state: "done", completedAt: "2026-10-27T12:14:00.000Z" },
    { key: "fields", state: "done", completedAt: "2026-10-27T12:31:00.000Z" },
    { key: "duplicates", state: "done", completedAt: "2026-10-28T06:21:00.000Z" },
    { key: "import", state: "done", completedAt: IMPORT_RUN_AT },
  ],
  fields: [
    { mondayColumn: "שם", field: "fullName", check: "ok" },
    { mondayColumn: "טלפון", field: "phone", check: "ok" },
    { mondayColumn: "מקור", field: "source", check: "ok" },
    { mondayColumn: "קבוצה", field: "group", check: "ok" },
    { mondayColumn: "סטטוס", field: "status", check: "ok" },
    { mondayColumn: "עדכונים", field: "notes", check: "ok" },
  ],
  // 1,321 items on 4 boards, 37 duplicates merged by phone: 1,284 leads, the 1,298 in the dashboard less this week's 14.
  totals: { itemsFound: 1321, leadsImported: 1284, duplicatesMerged: 37, notesSaved: 4912, errors: 0 },
  duplicatesBy: "phone",
  monday: "read-only",
  mondayClosedAt: null,
  mondayClosedByUserId: null,
};
