/**
 * Seed January 2026 challah events into the Challah board.
 * Run with:  cd Server && npx tsx scripts/seed-challah-jan.ts
 */
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5095155077";
const GROUP = "group_mm2pg5ew"; // Jan 2026

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
    name: "נועה בוקטוס",
    cv: {
      [COL.date]: { date: "2026-01-03" },
      [COL.dayOfWeek]: "שבת",
      [COL.phone]: { phone: normalizePhone("050-8565566"), countryShortName: "IL" },
      [COL.city]: "כפר סבא",
      [COL.address]: "רח הפרדס 6 בית הכנסת ר' יהודה אוהב ציון",
    },
  },
  {
    name: "ברנית מנוח",
    cv: {
      [COL.date]: { date: "2026-01-08" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: normalizePhone("053-8672162"), countryShortName: "IL" },
      [COL.tz]: "נוה",
      [COL.amount]: "1000",
      [COL.city]: "ראשון לציון",
      [COL.address]: "לרחוב 17",
      [COL.eventType]: "הפרשת חלה+שיע",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
      [COL.depositNotes]: { text: "שולם 1000ש\"ח בפייבוקס\nהופקה קבלה מספר 1767 תיק 71 (אורטל)" },
    },
  },
  {
    name: "שקד ברדע",
    cv: {
      [COL.date]: { date: "2026-01-15" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: normalizePhone("050-4066695"), countryShortName: "IL" },
      [COL.amount]: "3500",
      [COL.city]: "ראשון לציון",
      [COL.address]: "יוסף בוכריץ 9",
      [COL.eventType]: "הפרשת חלה+שיע",
      [COL.forms]: "במערכת",
      [COL.deposit]: "3500",
      [COL.notes]: { text: "עודכן שעה\nשי לי- לא יכולה לעבוד" },
      [COL.depositNotes]: { text: "תסדיר תשלום מקדמה ב-10 לחודש (אורטל)\nשולם בהעברה בנקאית 1000ש\"ח\nהעברה נקלטה והופקה קבלה מספר 1956 תיק 71 (אורטל)\nבוצעה העברה ע'ס 2500ש\"ח העברה טרם נקלטה ולכן לא הופקה קבלה (אורטל)\nהעברה בנקאית ע'ס 2500ש\"ח נקלטה במערכת\nהופקה קבלה מספר 2082 תיק 71 (אורטל)" },
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
  console.log("Seeding 3 January events into Challah board...\n");

  for (const e of events) {
    const data = await gql<{ create_item: { id: string } }>(
      `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
        create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
      }`,
      { b: BOARD, g: GROUP, n: e.name, cv: JSON.stringify(e.cv) },
    );
    console.log(`  ✓ ${e.name} → ${data.create_item.id}`);
  }

  console.log("\nDone — 3 rows seeded into Jan 2026");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
