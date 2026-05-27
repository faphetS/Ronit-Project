/**
 * Seed February 2026 challah events into the Challah board.
 * Run with:  cd Server && npx tsx scripts/seed-challah-feb.ts
 */
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5095155077";
const GROUP = "group_mm2pxc6s"; // Feb 2026

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

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("0") ? "+972" + d.slice(1) : d;
}

interface EventRow {
  name: string;
  cv: Record<string, unknown>;
}

const events: EventRow[] = [
  {
    name: "נטע טאבו",
    cv: {
      [COL.date]: { date: "2026-02-05" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: normalizePhone("053-5235365"), countryShortName: "IL" },
      [COL.amount]: "1000",
      [COL.city]: "יד רמבם",
      [COL.eventType]: "הפרשת חלה+מסיבת יום הולדת ומסיבת הודיה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "שי לי לא יכולה לעבוד" },
    },
  },
  {
    name: "אורנה אפנס",
    cv: {
      [COL.date]: { date: "2026-02-10" },
      [COL.dayOfWeek]: "שלישי",
      [COL.phone]: { phone: normalizePhone("052-5752900"), countryShortName: "IL" },
      [COL.amount]: "1000",
      [COL.city]: "כפר שלם",
      [COL.address]: "בית כנסת כתר תורה",
      [COL.eventType]: "הפקה לכלה ללא תפאורה",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה\nהתחלה 20:00" },
    },
  },
  {
    name: "שימרית דהן",
    cv: {
      [COL.date]: { date: "2026-02-15" },
      [COL.dayOfWeek]: "ראשון",
      [COL.phone]: { phone: normalizePhone("052-6265556"), countryShortName: "IL" },
      [COL.amount]: "ללא תשלום",
      [COL.city]: "ק.אתא שיעור פתוח",
      [COL.address]: "בית הכנסת אוהל רבקה בסמוך להיכל שלמה רח' קיבוץ גלויות 13",
    },
  },
  {
    name: "רוז סרוסי",
    cv: {
      [COL.date]: { date: "2026-02-17" },
      [COL.dayOfWeek]: "שלישי (ערב ר\"ח אדר)",
      [COL.phone]: { phone: normalizePhone("054-7713401"), countryShortName: "IL" },
      [COL.agent]: "אורטל",
      [COL.amount]: "5000",
      [COL.city]: "רחובות",
      [COL.address]: "קלמן ביאלר 15 רחובות",
      [COL.eventType]: "ה.חלה+שיעור תורה לכלה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "5000",
      [COL.notes]: { text: "עודכן שעה\nלאה סרוסי 054-5611462" },
    },
  },
  {
    name: "שפרה",
    cv: {
      [COL.date]: { date: "2026-02-18" },
      [COL.dayOfWeek]: "רביעי",
      [COL.phone]: { phone: normalizePhone("054-7497070"), countryShortName: "IL" },
      [COL.amount]: "ללא תשלום",
      [COL.city]: "זיכרון יעקב",
      [COL.address]: "רח' החינוך 14 (בית הספר יעב\"ץ)",
      [COL.eventType]: "שיעור תורה לעילוי נשמת עופרה ז\"ל",
    },
  },
  {
    name: "אגם נחמני",
    cv: {
      [COL.date]: { date: "2026-02-19" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: normalizePhone("054-7772007"), countryShortName: "IL" },
      [COL.amount]: "4500",
      [COL.city]: "קרית אתא",
      [COL.address]: "יהודה הלוי 19",
      [COL.eventType]: "יום הולדת 22",
      [COL.forms]: "במערכת",
      [COL.deposit]: "4500",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "לירון נחמן",
    cv: {
      [COL.date]: { date: "2026-02-24" },
      [COL.dayOfWeek]: "שלישי",
      [COL.phone]: { phone: normalizePhone("050-9481077"), countryShortName: "IL" },
      [COL.agent]: "נווה",
      [COL.amount]: "1000",
      [COL.city]: "מושב תדהר",
      [COL.eventType]: "הפקה לכלה ללא תפאורה",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "שני מרזייב",
    cv: {
      [COL.date]: { date: "2026-02-28" },
      [COL.dayOfWeek]: "שבת",
      [COL.phone]: { phone: normalizePhone("053-6240825"), countryShortName: "IL" },
      [COL.tz]: "ישיבה",
      [COL.city]: "בית דגן",
      [COL.address]: "זה בבית כנסת ״היכל הודיה תאיר דרכך״ בכתובת היובל 2",
    },
  },
];

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2025-04" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`Monday GraphQL error: ${JSON.stringify(json.errors)}`);
  if (!json.data) throw new Error("Monday returned no data");
  return json.data;
}

async function main(): Promise<void> {
  console.log("Seeding 8 February events into Challah board...\n");

  for (const e of events) {
    const data = await gql<{ create_item: { id: string } }>(
      `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
        create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
      }`,
      { b: BOARD, g: GROUP, n: e.name, cv: JSON.stringify(e.cv) },
    );
    console.log(`  ✓ ${e.name} → ${data.create_item.id}`);
  }

  console.log("\nDone — 8 rows seeded into Feb 2026");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
