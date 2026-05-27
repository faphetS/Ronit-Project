/**
 * Seed April 2026 challah events + deposit notes into the Challah board.
 * Run with:  cd Server && npx tsx scripts/seed-challah-apr.ts
 */
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5095155077";
const GROUP = "group_mm2ptn44"; // Apr 2026

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

function ph(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("0") ? "+972" + d.slice(1) : d;
}

interface EventRow { name: string; cv: Record<string, unknown> }

const events: EventRow[] = [
  {
    name: "אושר זנזורי",
    cv: {
      [COL.date]: { date: "2026-04-09" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: ph("054-6802990"), countryShortName: "IL" },
      [COL.amount]: "1000",
      [COL.city]: "אור יהודה",
      [COL.address]: "אולמי אקסייט",
      [COL.eventType]: "הפרשת חלה+שיעורה לבת מצווה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
      [COL.depositNotes]: { text: "שולם בהעברה בנקאית 1000ש\"ח העברה נקלטה והופקה קבלה מספר 2105 תיק 78 (אורטל)\nעברה לתאריך 16/4/26 (אורטל)" },
    },
  },
  {
    name: "יהלומה זוהרי",
    cv: {
      [COL.date]: { date: "2026-04-12" },
      [COL.dayOfWeek]: "ראשון",
      [COL.phone]: { phone: ph("050-5606350"), countryShortName: "IL" },
      [COL.amount]: "1000",
      [COL.city]: "בת ים",
      [COL.address]: "אריק איינשטיין 3",
      [COL.eventType]: "הפקה לכלה ללא תפאורה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
    },
  },
  {
    name: "אושר זנזורי",
    cv: {
      [COL.date]: { date: "2026-04-16" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: ph("054-6802990"), countryShortName: "IL" },
      [COL.amount]: "1000",
      [COL.city]: "אור יהודה",
      [COL.address]: "אולמי אקסייט",
      [COL.eventType]: "הפרשת חלה+שיעורה לבת מצווה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "שירלי קאניאס",
    cv: {
      [COL.date]: { date: "2026-04-25" },
      [COL.dayOfWeek]: "שבת",
      [COL.phone]: { phone: ph("052-8299678"), countryShortName: "IL" },
      [COL.amount]: "שיעור תורה פתוח",
      [COL.city]: "רמלה",
      [COL.address]: "הרב הרצוג 7 בית הכנסת עץ החיים",
    },
  },
  {
    name: "רחלי אשכנזי",
    cv: {
      [COL.date]: { date: "2026-04-30" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: ph("050-8363760"), countryShortName: "IL" },
      [COL.amount]: "1000",
      [COL.city]: "כפר יונה",
      [COL.address]: "החורב 12",
      [COL.eventType]: "הפקה לכלה ללא תפאורה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
      [COL.depositNotes]: { text: "שולם בפייבוקס 1000ש\"ח הופקה קבלה מספר 2160 תיק 78 (אורטל)\nנשלחה רשימת הערכות ותואם זמנים (אורטל)" },
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
  console.log("Seeding 5 April events into Challah board...\n");
  for (const e of events) {
    const data = await gql<{ create_item: { id: string } }>(
      `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
        create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
      }`,
      { b: BOARD, g: GROUP, n: e.name, cv: JSON.stringify(e.cv) },
    );
    console.log(`  ✓ ${e.name} (${e.cv[COL.date] && (e.cv[COL.date] as {date:string}).date}) → ${data.create_item.id}`);
  }
  console.log("\nDone — 5 rows seeded into Apr 2026 (with 2 deposit notes)");
}

main().catch((err) => { console.error("FAILED:", err); process.exit(1); });
