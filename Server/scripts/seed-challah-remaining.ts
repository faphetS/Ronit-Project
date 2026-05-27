/**
 * Seed challah events for May–Dec 2026 into the Monday.com Challah board.
 * Also applies minor fixes to existing Jan–Apr items.
 * Also seeds cancellation-tab events into their respective monthly groups.
 *
 * Run with:  cd Server && npx tsx scripts/seed-challah-remaining.ts
 */

import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5095155077";

const COL = {
  date: "date_mm3r77vt",
  dayOfWeek: "text_mm3r6hqy",
  phone: "phone_mm2pf4nm",
  tz: "text_mm3r9dhg",
  agent: "text_mm3r84hb",
  amount: "text_mm3rckd0",
  city: "text_mm3pf74e",
  address: "text_mm3rwmag",
  eventType: "text_mm3r8e1m",
  forms: "text_mm3r7qvw",
  deposit: "numeric_mm3r14gy",
  marketing: "text_mm3rjw46",
  notes: "long_text_mm3r3n0w",
  depositNotes: "long_text_mm3r6rwg",
};

const GROUP: Record<string, string> = {
  "Jan 2026":  "group_mm2pg5ew",
  "Feb 2026":  "group_mm2pxc6s",
  "Mar 2026":  "group_mm2prggn",
  "Apr 2026":  "group_mm2ptn44",
  "May 2026":  "group_mm2pkgwk",
  "Jun 2026":  "group_mm2psepz",
  "Jul 2026":  "group_mm2ph5jm",
  "Aug 2026":  "group_mm2prb94",
  "Sep 2026":  "group_mm2phsmg",
  "Oct 2026":  "group_mm2p1m3x",
  "Nov 2026":  "group_mm2p666d",
  "Dec 2026":  "group_mm2p7ycs",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ph(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("0") && d.length >= 9) return "972" + d.slice(1);
  return d;
}

function extractDate(dateRaw: string): string {
  // "2026-05-03 00:00:00" → "2026-05-03"
  return dateRaw.split(" ")[0];
}

function isTextDeposit(val: string): boolean {
  // If deposit is a text note (not parseable as a plain number) treat as deposit notes
  if (!val || val.trim() === "") return false;
  const trimmed = val.trim();
  // If it matches a number like "1000" or "1000.0" it's numeric
  if (/^\d+(\.\d+)?$/.test(trimmed)) return false;
  return true;
}

function parseDepositNumeric(val: string): number | null {
  if (!val || val.trim() === "") return null;
  const trimmed = val.trim();
  if (isTextDeposit(trimmed)) return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

// Exclusion rules: returns true if the event should be skipped
function shouldExclude(name: string): boolean {
  const excludeExact = new Set([
    "אומן", "אומן בערב", "אומן סליחות",
    "פסח", "שבועות", "סוכות", "תשעה באב",
    "טו בשבט", "חופש",
  ]);
  if (excludeExact.has(name)) return true;

  const excludePrefixes = [
    "ראש השנה",
    "יום כיפור",
    "ערב ",
  ];
  for (const prefix of excludePrefixes) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

// An event must have date + day + name all present, plus at least one other data field
function hasMinimumData(ev: EventRaw): boolean {
  if (!ev.date_raw || !ev.day || !ev.name) return false;
  const extras = [ev.phone, ev.tz, ev.agent, ev.amount, ev.city, ev.address, ev.event_type, ev.forms, ev.deposit, ev.marketing, ev.notes, ev.deposit_notes];
  return extras.some((f) => f && f.trim() !== "");
}

// ---------------------------------------------------------------------------
// GraphQL client
// ---------------------------------------------------------------------------

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN,
      "API-Version": "2025-04",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`Monday GraphQL error: ${JSON.stringify(json.errors)}`);
  if (!json.data) throw new Error("Monday returned no data");
  return json.data;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventRaw {
  date_raw: string;
  day: string;
  name: string;
  phone: string;
  tz: string;
  agent: string;
  amount: string;
  city: string;
  address: string;
  event_type: string;
  forms: string;
  deposit: string;
  marketing: string;
  row: number;
  notes: string;
  deposit_notes: string;
}

interface CommentsMonth {
  [cellRef: string]: string;
}

// ---------------------------------------------------------------------------
// Build column_values for an event
// ---------------------------------------------------------------------------

function buildCV(ev: EventRaw, depositNoteOverride?: string): Record<string, unknown> {
  const cv: Record<string, unknown> = {};

  const dateStr = extractDate(ev.date_raw);
  cv[COL.date] = { date: dateStr };
  cv[COL.dayOfWeek] = ev.day;

  if (ev.phone && ev.phone.trim()) {
    const phoneDigits = ph(ev.phone);
    if (phoneDigits.length >= 9) {
      cv[COL.phone] = { phone: phoneDigits, countryShortName: "IL" };
    }
  }

  if (ev.tz && ev.tz.trim()) cv[COL.tz] = ev.tz;
  if (ev.agent && ev.agent.trim()) cv[COL.agent] = ev.agent;
  if (ev.amount && ev.amount.trim()) cv[COL.amount] = ev.amount;
  if (ev.city && ev.city.trim()) cv[COL.city] = ev.city;
  if (ev.address && ev.address.trim()) cv[COL.address] = ev.address;
  if (ev.event_type && ev.event_type.trim()) cv[COL.eventType] = ev.event_type;
  if (ev.forms && ev.forms.trim()) cv[COL.forms] = ev.forms;
  if (ev.marketing && ev.marketing.trim()) cv[COL.marketing] = ev.marketing;

  // Deposit — numeric or text note
  const depositVal = ev.deposit ? ev.deposit.trim() : "";
  if (depositVal) {
    const n = parseDepositNumeric(depositVal);
    if (n !== null) {
      cv[COL.deposit] = n;
    }
    // text deposit → goes to deposit notes (handled below)
  }

  // Notes field — combine ev.notes and any deposit text note
  const noteParts: string[] = [];
  if (ev.notes && ev.notes.trim()) noteParts.push(ev.notes.trim());
  if (isTextDeposit(depositVal)) noteParts.push(`[מקדמה: ${depositVal}]`);
  if (noteParts.length > 0) cv[COL.notes] = { text: noteParts.join("\n") };

  // Deposit notes
  const depositNoteText = depositNoteOverride ?? (ev.deposit_notes ? ev.deposit_notes.trim() : "");
  if (depositNoteText) cv[COL.depositNotes] = { text: depositNoteText };

  return cv;
}

// ---------------------------------------------------------------------------
// Create item
// ---------------------------------------------------------------------------

async function createItem(groupId: string, name: string, cv: Record<string, unknown>): Promise<string> {
  const data = await gql<{ create_item: { id: string } }>(
    `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
      create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
    }`,
    { b: BOARD, g: groupId, n: name, cv: JSON.stringify(cv) },
  );
  return data.create_item.id;
}

// ---------------------------------------------------------------------------
// Update existing item (fixes for Jan-Apr)
// ---------------------------------------------------------------------------

async function updateItem(itemId: string, cv: Record<string, unknown>): Promise<void> {
  await gql<{ change_multiple_column_values: { id: string } }>(
    `mutation ($b: ID!, $i: ID!, $cv: JSON!) {
      change_multiple_column_values(board_id: $b, item_id: $i, column_values: $cv) { id }
    }`,
    { b: BOARD, i: itemId, cv: JSON.stringify(cv) },
  );
}

// ---------------------------------------------------------------------------
// Lookup comments for a given row in a month's comment map
// ---------------------------------------------------------------------------

function getCommentForCell(monthComments: CommentsMonth, col: string, row: number): string | null {
  const key = `${col}${row}`;
  return monthComments[key] ?? null;
}

// Build deposit notes for an event using comment map
function resolveDepositNotes(ev: EventRaw, monthComments: CommentsMonth): string {
  // L-column comment for this row takes precedence over ev.deposit_notes (already in JSON)
  const lComment = getCommentForCell(monthComments, "L", ev.row);
  if (lComment) return lComment;
  return ev.deposit_notes ? ev.deposit_notes.trim() : "";
}

// Build extra notes from J/K/N/O column comments
function resolveExtraNotes(ev: EventRaw, monthComments: CommentsMonth): string {
  const parts: string[] = [];
  for (const col of ["J", "K", "N", "O"]) {
    const c = getCommentForCell(monthComments, col, ev.row);
    if (c) parts.push(c.trim());
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const eventsPath = resolve("scripts/output/challah-all-events.json");
  const commentsPath = resolve("scripts/output/challah-all-comments.json");

  const allEvents = JSON.parse(readFileSync(eventsPath, "utf-8")) as Record<string, EventRaw[]>;
  const allComments = JSON.parse(readFileSync(commentsPath, "utf-8")) as Record<string, CommentsMonth>;

  // month_N → month name
  const monthKeyMap: Record<string, string> = {
    month_1: "Jan 2026", month_2: "Feb 2026", month_3: "Mar 2026",
    month_4: "Apr 2026", month_5: "May 2026", month_6: "Jun 2026",
    month_7: "Jul 2026", month_8: "Aug 2026", month_9: "Sep 2026",
    month_10: "Oct 2026", month_11: "Nov 2026", month_12: "Dec 2026",
  };

  const summary: Record<string, number> = {};

  // -------------------------------------------------------------------------
  // 1. Apply fixes to existing Jan-Apr items
  // -------------------------------------------------------------------------

  console.log("\n=== Applying Jan-Apr fixes ===\n");

  // Fix 1: Feb item 2944987758 — append J11 comment to notes
  // The J11 comment: "ללא שאלות על הסבתות חמות ודודות (אורטל)"
  // This event already has notes "עודכן שעה\nהתחלה 20:00\nללא שאלות על הסבתות חמות ודודות (אורטל)"
  // so it's already in the JSON — skip (the JSON already includes it)
  console.log("  Fix 1 (Feb 2944987758 אורנה אפנס): J11 comment already embedded in exported notes field — skipping.");

  // Fix 2: Mar item 2945045962 — add N9 comment to notes
  {
    const itemId = "2945045962";
    const n9 = allComments["month_3"]?.["N9"] ?? "";
    if (n9) {
      const cv: Record<string, unknown> = {
        [COL.notes]: { text: "עודכן שעה\n" + n9 },
      };
      await updateItem(itemId, cv);
      console.log(`  Fix 2 (Mar 2945045962 יהלומה זוהרי): Updated notes with N9 comment.`);
    } else {
      console.log("  Fix 2: N9 comment not found in month_3 comments.");
    }
  }

  // Fix 3: Mar item 2945039776 — add J20 comment to notes
  {
    const itemId = "2945039776";
    const j20 = allComments["month_3"]?.["J20"] ?? "";
    if (j20) {
      const cv: Record<string, unknown> = {
        [COL.notes]: { text: "עודכן שעה\n" + j20 },
      };
      await updateItem(itemId, cv);
      console.log(`  Fix 3 (Mar 2945039776 פבין אלמליח): Updated notes with J20 comment.`);
    } else {
      console.log("  Fix 3: J20 comment not found in month_3 comments.");
    }
  }

  // Fix 4: Mar item 2945046721 — add L24 deposit note
  {
    const itemId = "2945046721";
    const l24 = allComments["month_3"]?.["L24"] ?? "";
    if (l24) {
      const cv: Record<string, unknown> = {
        [COL.depositNotes]: { text: l24 },
      };
      await updateItem(itemId, cv);
      console.log(`  Fix 4 (Mar 2945046721 תהילה): Updated depositNotes with L24 comment.`);
    } else {
      console.log("  Fix 4: L24 comment not found in month_3 comments.");
    }
  }

  // -------------------------------------------------------------------------
  // 2. Seed May–Dec events
  // -------------------------------------------------------------------------

  const monthsToSeed = ["May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026"];

  for (const monthName of monthsToSeed) {
    const groupId = GROUP[monthName];
    const events: EventRaw[] = allEvents[monthName] ?? [];

    // Find comment key for this month
    const commentKey = Object.entries(monthKeyMap).find(([, v]) => v === monthName)?.[0] ?? null;
    const monthComments: CommentsMonth = commentKey ? (allComments[commentKey] ?? {}) : {};

    console.log(`\n=== Seeding ${monthName} (group: ${groupId}) ===`);

    let seeded = 0;
    let skipped = 0;

    for (const ev of events) {
      if (!hasMinimumData(ev)) {
        skipped++;
        continue;
      }
      if (shouldExclude(ev.name)) {
        console.log(`  SKIP (excluded name): ${ev.name}`);
        skipped++;
        continue;
      }

      // Build deposit notes — L-column comment if present, else ev.deposit_notes
      const depositNotes = resolveDepositNotes(ev, monthComments);

      // Extra notes from J/K/N/O column comments — append to notes field
      const extraNotes = resolveExtraNotes(ev, monthComments);

      // Build column values
      const cv = buildCV(ev, depositNotes);

      // Merge extra notes into notes field
      if (extraNotes) {
        const existingNotes = cv[COL.notes];
        let base = "";
        if (existingNotes && typeof existingNotes === "object" && "text" in (existingNotes as Record<string, unknown>)) {
          base = (existingNotes as { text: string }).text;
        }
        cv[COL.notes] = { text: base ? base + "\n" + extraNotes : extraNotes };
      }

      try {
        const id = await createItem(groupId, ev.name, cv);
        const dateStr = extractDate(ev.date_raw);
        console.log(`  + ${ev.name} (${dateStr}) → item ${id}`);
        seeded++;
      } catch (err) {
        console.error(`  ERROR creating ${ev.name}: ${(err as Error).message}`);
      }
    }

    summary[monthName] = seeded;
    console.log(`  ${monthName}: ${seeded} seeded, ${skipped} skipped`);
  }

  // -------------------------------------------------------------------------
  // 3. Seed cancellation-tab events into their respective monthly groups
  // -------------------------------------------------------------------------

  console.log("\n=== Seeding cancellation-tab events ===\n");

  interface CancellationEvent {
    groupMonth: string;
    name: string;
    cv: Record<string, unknown>;
  }

  const cancellationEvents: CancellationEvent[] = [
    // 1. 12/5/26 מירב בוזגלו → May group
    {
      groupMonth: "May 2026",
      name: "מירב בוזגלו",
      cv: {
        [COL.date]: { date: "2026-05-12" },
        [COL.dayOfWeek]: "שלישי",
        [COL.phone]: { phone: ph("054-5469774"), countryShortName: "IL" },
        [COL.agent]: "אורטל",
        [COL.amount]: "3500",
        [COL.city]: "יבנה",
        [COL.address]: "תעדכן",
        [COL.eventType]: "הפרשת חלה+שיעור תורה לכלה",
        [COL.forms]: "במערכת",
        [COL.deposit]: 1000,
      },
    },
    // 2. 16/4/26 מורן חזיזה → April group
    {
      groupMonth: "Apr 2026",
      name: "מורן חזיזה",
      cv: {
        [COL.date]: { date: "2026-04-16" },
        [COL.dayOfWeek]: "חמישי",
        [COL.phone]: { phone: ph("054-2502502"), countryShortName: "IL" },
        [COL.amount]: "3500",
        [COL.city]: "ראשון לציון",
        [COL.address]: "החיילות 3",
        [COL.eventType]: "ה.חלה+שיעור תורה ליום הולדת 13",
        [COL.forms]: "במערכת",
        [COL.deposit]: 1000,
      },
    },
    // 3. 27/5/26 פבין אלמליח → May group (two phones)
    {
      groupMonth: "May 2026",
      name: "פבין אלמליח",
      cv: {
        [COL.date]: { date: "2026-05-27" },
        [COL.dayOfWeek]: "רביעי",
        [COL.phone]: { phone: ph("054-5825428"), countryShortName: "IL" },
        [COL.tz]: "054-2421761",
        [COL.amount]: "5000",
        [COL.city]: "באר שבע",
        [COL.address]: "בית הכנסת בית ישראל רח' מנדלי מוכר הספרים 9",
        [COL.eventType]: "הפקה לבת מצווה (ילדה עם צרכים מיוחדים)",
        [COL.deposit]: 1000,
      },
    },
    // 4. 26/5/26 ענת מלצר → May group
    {
      groupMonth: "May 2026",
      name: "ענת מלצר",
      cv: {
        [COL.date]: { date: "2026-05-26" },
        [COL.dayOfWeek]: "שלישי",
        [COL.phone]: { phone: ph("054-5577101"), countryShortName: "IL" },
        [COL.agent]: "אורטל",
        [COL.amount]: "3500",
        [COL.city]: "ראשון לציון",
        [COL.address]: "תעדכן",
        [COL.eventType]: "הפרשת חלה+שיעור תורה לכלה",
        [COL.forms]: "במערכת",
        [COL.deposit]: 1000,
      },
    },
    // 5. 10/8/26 צופית מדינה-דיקלה מדינה → August group
    {
      groupMonth: "Aug 2026",
      name: "צופית מדינה-דיקלה מדינה",
      cv: {
        [COL.date]: { date: "2026-08-10" },
        [COL.dayOfWeek]: "שני",
        [COL.phone]: { phone: ph("054-6200092"), countryShortName: "IL" },
        [COL.amount]: "5000",
        [COL.city]: "חולון",
        [COL.address]: "תעדכן",
        [COL.eventType]: "הפקה לכלה ללא תפאורה",
        [COL.forms]: "במערכת",
        [COL.deposit]: 2500,
      },
    },
    // 6. 3/9/26 ספיר בנימיני → September group
    {
      groupMonth: "Sep 2026",
      name: "ספיר בנימיני",
      cv: {
        [COL.date]: { date: "2026-09-03" },
        [COL.dayOfWeek]: "חמישי",
        [COL.phone]: { phone: ph("052-3303236"), countryShortName: "IL" },
        [COL.amount]: "3500",
        [COL.city]: "מרכז",
        [COL.eventType]: "שיעור תורה+הפרשת חלה לכלה",
        [COL.forms]: "במערכת",
        [COL.deposit]: 1000,
      },
    },
    // 7. 26/10/26 אביב שוורץ → October group
    {
      groupMonth: "Oct 2026",
      name: "אביב שוורץ",
      cv: {
        [COL.date]: { date: "2026-10-26" },
        [COL.dayOfWeek]: "שני",
        [COL.phone]: { phone: ph("050-9803981"), countryShortName: "IL" },
        [COL.amount]: "5500",
        [COL.city]: "קרית אתא",
        [COL.address]: "תעדכן",
        [COL.eventType]: "הפקה לכלה ללא תפאורה",
        [COL.forms]: "במערכת",
        [COL.deposit]: 1000,
      },
    },
  ];

  let cancellationSeeded = 0;
  for (const ev of cancellationEvents) {
    const groupId = GROUP[ev.groupMonth];
    try {
      const dateStr = (ev.cv[COL.date] as { date: string }).date;
      const id = await createItem(groupId, ev.name, ev.cv);
      console.log(`  + ${ev.name} (${dateStr}, ${ev.groupMonth}) → item ${id}`);
      cancellationSeeded++;
      // Add to summary
      summary[ev.groupMonth] = (summary[ev.groupMonth] ?? 0) + 1;
    } catch (err) {
      console.error(`  ERROR creating ${ev.name}: ${(err as Error).message}`);
    }
  }

  console.log(`\n  ${cancellationSeeded}/7 cancellation events seeded`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log("\n=== SUMMARY ===\n");
  for (const month of monthsToSeed) {
    console.log(`  ${month}: ${summary[month] ?? 0} seeded`);
  }
  console.log(`  Cancellation events: ${cancellationSeeded} seeded`);
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log(`\n  Total items created: ${total}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
