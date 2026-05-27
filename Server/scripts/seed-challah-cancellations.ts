import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5095155077";
const GROUP = "group_mm3rm66v"; // ביטולים

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
};

function ph(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("0") ? "+972" + d.slice(1) : d;
}

const events = [
  {
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
      [COL.deposit]: "1000",
    },
  },
  {
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
      [COL.deposit]: "1000",
    },
  },
  {
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
      [COL.deposit]: "1000",
    },
  },
  {
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
      [COL.deposit]: "1000",
    },
  },
  {
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
      [COL.deposit]: "2500",
    },
  },
  {
    name: "ספיר בנימיני",
    cv: {
      [COL.date]: { date: "2026-09-03" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: ph("052-3303236"), countryShortName: "IL" },
      [COL.amount]: "3500",
      [COL.city]: "מרכז",
      [COL.eventType]: "שיעור תורה+הפרשת חלה לכלה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
    },
  },
  {
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
      [COL.deposit]: "1000",
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
  console.log("Seeding 7 events into ביטולים group...\n");
  for (const e of events) {
    const data = await gql<{ create_item: { id: string } }>(
      `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
        create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
      }`,
      { b: BOARD, g: GROUP, n: e.name, cv: JSON.stringify(e.cv) },
    );
    console.log(`  ✓ ${e.name} → ${data.create_item.id}`);
  }
  console.log("\nDone — 7 items in ביטולים");
}

main().catch((err) => { console.error("FAILED:", err); process.exit(1); });
