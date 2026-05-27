/**
 * Seed March 2026 challah events into the Challah board.
 * Run with:  cd Server && npx tsx scripts/seed-challah-mar.ts
 */
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5095155077";
const GROUP = "group_mm2prggn"; // Mar 2026

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

function ph(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("0") ? "+972" + d.slice(1) : d;
}

interface EventRow { name: string; cv: Record<string, unknown> }

const events: EventRow[] = [
  {
    name: "כנרת יעקובי",
    cv: {
      [COL.date]: { date: "2026-03-01" },
      [COL.dayOfWeek]: "ראשון",
      [COL.phone]: { phone: ph("050-7271756"), countryShortName: "IL" },
      [COL.amount]: "5000",
      [COL.city]: "אשדוד",
      [COL.address]: "אולמי הילה ארועי יוקרה רח' הבושם 7",
      [COL.eventType]: "הפקה לבת מצווה ללא תפאורה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "אושר זנזורי",
    cv: {
      [COL.date]: { date: "2026-03-05" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: ph("054-6802990"), countryShortName: "IL" },
      [COL.city]: "אור יהודה",
      [COL.address]: "יחזקאל עבודי 7",
      [COL.eventType]: "שיעור תורה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1500",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "יהלומה זוהרי",
    cv: {
      [COL.date]: { date: "2026-03-08" },
      [COL.dayOfWeek]: "ראשון",
      [COL.phone]: { phone: ph("050-5606350"), countryShortName: "IL" },
      [COL.agent]: "ורד בוקבזה מפיקת האירוע",
      [COL.amount]: "5000",
      [COL.city]: "ראשון לציון",
      [COL.address]: "אולמי סאיי משה שרת 19 ראשלצ",
      [COL.eventType]: "הפקה לכלה ללא תפאורה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "לילות מרוקו-יהורם מלכה",
    cv: {
      [COL.date]: { date: "2026-03-09" },
      [COL.dayOfWeek]: "שני",
      [COL.phone]: { phone: ph("050-7908484"), countryShortName: "IL" },
      [COL.amount]: "4000",
      [COL.city]: "ים המלח",
      [COL.forms]: "במערכת",
    },
  },
  {
    name: "שיעור תורה שירה חזן",
    cv: {
      [COL.date]: { date: "2026-03-17" },
      [COL.dayOfWeek]: "שלישי",
      [COL.city]: "בית שמש",
    },
  },
  {
    name: "חן גאקי",
    cv: {
      [COL.date]: { date: "2026-03-18" },
      [COL.dayOfWeek]: "רביעי",
      [COL.phone]: { phone: ph("050-4344274"), countryShortName: "IL" },
      [COL.amount]: "1000",
      [COL.city]: "רמת גן",
      [COL.address]: "מלכי צדק 9",
      [COL.eventType]: "הפרשת חלה+שיעור תורה לעילוי נשמת אמא שלה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "פבין אלמליח",
    cv: {
      [COL.date]: { date: "2026-03-19" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: ph("054-5825428"), countryShortName: "IL" },
      [COL.tz]: "054-2421761",
      [COL.amount]: "5000",
      [COL.city]: "באר שבע",
      [COL.address]: "בית הכנסת בית ישראל רח' מנדלי מוכר הספרים 9",
      [COL.eventType]: "הפקה לבת מצווה (ילדה עם צרכים מיוחדים)",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "שירלי קאניאס",
    cv: {
      [COL.date]: { date: "2026-03-21" },
      [COL.dayOfWeek]: "שבת",
      [COL.phone]: { phone: ph("052-8299678"), countryShortName: "IL" },
    },
  },
  {
    name: "ליאן רונן",
    cv: {
      [COL.date]: { date: "2026-03-22" },
      [COL.dayOfWeek]: "ראשון",
      [COL.phone]: { phone: ph("054-2626627"), countryShortName: "IL" },
      [COL.amount]: "1000",
      [COL.city]: "יפו",
      [COL.address]: "בית אשל 9",
      [COL.eventType]: "הפקה לכלה ללא תפאורה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "תהילה",
    cv: {
      [COL.date]: { date: "2026-03-23" },
      [COL.dayOfWeek]: "שני",
      [COL.phone]: { phone: ph("050-9941670"), countryShortName: "IL" },
      [COL.amount]: "5900",
      [COL.city]: "עיריית כפר סבא",
      [COL.address]: "תל חי 68",
      [COL.eventType]: "הפקה לעיריית כפר סבא",
      [COL.notes]: { text: "עודכן שעה" },
    },
  },
  {
    name: "הודיה דוידוב",
    cv: {
      [COL.date]: { date: "2026-03-28" },
      [COL.dayOfWeek]: "שבת",
      [COL.phone]: { phone: ph("058-7007883"), countryShortName: "IL" },
      [COL.tz]: "אור יהודה",
      [COL.city]: "אור יהודה",
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
  console.log("Seeding 11 March events into Challah board...\n");
  for (const e of events) {
    const data = await gql<{ create_item: { id: string } }>(
      `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
        create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
      }`,
      { b: BOARD, g: GROUP, n: e.name, cv: JSON.stringify(e.cv) },
    );
    console.log(`  ✓ ${e.name} → ${data.create_item.id}`);
  }
  console.log("\nDone — 11 rows seeded into Mar 2026");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
