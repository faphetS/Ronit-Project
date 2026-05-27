/**
 * Add deposit notes to March 2026 challah events.
 * Run with:  cd Server && npx tsx scripts/seed-challah-mar-notes.ts
 */
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5095155077";
const COL_DN = "long_text_mm3r6rwg";

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

const updates = [
  {
    name: "כנרת יעקובי",
    itemId: "2945045346",
    text: "תסדיר תשלום ב-1.2 (אורטל)\nשולם בהעברה בנקאית 1000ש\"ח העברה נקלטה והופקה קבלה מספר 2126 תיק 76 (אורטל)\nביקשה להוסיף את צוות המתופפות (אורטל)\nהאירוע ידחה בשל המצב הביטחוני\nכנרת תצור קשר לתיאום מועד חדש (אורטל)\nעברה לתאריך 31/5 (אורטל)",
  },
  {
    name: "אושר זנזורי",
    itemId: "2945056361",
    text: "שולם בהעברה בנקאית 1500ש\"ח\nהופקה קבלה מספר 2139 תיק 76 (אורטל)\nהאירוע ידחה בשל המצב הביטחוני\nאושר תצור קשר לתיאום מועד חדש (אורטל)",
  },
  {
    name: "יהלומה זוהרי",
    itemId: "2945045962",
    text: "שלום 1000ש\"ח בהעברה בנקאית\nהופקה קבלה מספר 2042 תיק 76 (אורטל)\nתוגש מנה ראושנה צפי לסיום המנה עד השעה 20:30 לאחר מכן יתחיל טקס ההפרשת חלה\nמנה שנייה תוגש בסיום הטקס ולאחר מכן ממשיכים לחינה הכולל גברים (אורטל)\nעברה לתאריך 12/4/26 (אורטל)",
  },
  {
    name: "חן גאקי",
    itemId: "2945039688",
    text: "שולם בהעברה בנקאית 200ש\"ח\nהופקה קבלה מספר 2175 תיק 76\nשולם 400ש\"ח הופקה קבלה מספר 2176 תיק 76\nשולם 400ש\"ח הופקה קבלה מספר 2177 תיק 76 (אורטל)",
  },
  {
    name: "פבין אלמליח",
    itemId: "2945039776",
    text: "שולם בהעברה בנקאית 1000ש\"ח\nהעברה נקלטה והופקה קבלה מספר 1962 תיק 76 (אורטל)\nעברה לתאריך 27/5 בעקבות המצב הבטחוני (אורטל)",
  },
  {
    name: "ליאן רונן",
    itemId: "2945060400",
    text: "בוצעה העברה בנקאית ע'ס 1000ש\"ח העברה טרם נקלטה ולכן לא הופקה קבלה (אורטל)\nהעברה ע'ס 1000ש\"ח נקלטה במערכת\nהופקה קבלה מספר 2153 תיק 76 (אורטל)",
  },
];

async function main(): Promise<void> {
  console.log("Adding deposit notes to March events...\n");
  for (const u of updates) {
    await gql<{ change_multiple_column_values: { id: string } }>(
      `mutation ($b: ID!, $i: ID!, $cv: JSON!) {
        change_multiple_column_values(board_id: $b, item_id: $i, column_values: $cv) { id }
      }`,
      { b: BOARD, i: u.itemId, cv: JSON.stringify({ [COL_DN]: { text: u.text } }) },
    );
    console.log(`  ✓ ${u.name}`);
  }
  console.log("\nDone — 6 deposit notes added");
}

main().catch((err) => { console.error("FAILED:", err); process.exit(1); });
