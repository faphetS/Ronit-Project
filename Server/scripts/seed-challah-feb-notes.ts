/**
 * Add deposit notes to February 2026 challah events.
 * Run with:  cd Server && npx tsx scripts/seed-challah-feb-notes.ts
 */
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5095155077";
const COL_DEPOSIT_NOTES = "long_text_mm3r6rwg";

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
    name: "נטע טאבו",
    itemId: "2944983832",
    text: "שולם בפייבוקס 1000ש\"ח\nהופקה קבלה מספר 2099 תיק 67 (אורטל)",
  },
  {
    name: "אורנה אפנס",
    itemId: "2944987758",
    text: "ביצעה העברה בנקאית ע'ס 1000ש\"ח העברה טרם נקלטה ולכן לא הופקה קבלה (אורטל)\nהעברה ע'ס 1000ש\"ח נקלטה במעכרת\nהופקה קבלה מספר 2034 תיק 77 (אורטל)",
  },
  {
    name: "רוז סרוסי",
    itemId: "2944996301",
    text: "שולם בהעברה בנקאית 1000ש\"ח העברה נקלטה והופקה קבלה מספר 2023 תיק 67 (אורטל)\nהאמא ביקשה להוסיף צוות מתופפות בהפתעה לכלה\n(אורטל)\nהעברה ע'ס 4000ש\"ח נקלטה במערכת\nהופקה קבלה מספר 2179 תיק 67 (אורטל)",
  },
  {
    name: "אגם נחמני",
    itemId: "2944990447",
    text: "שולם 1000ש\"ח בפייבוקס\nהופקה קבלה מספר 2093 תיק 67 (אורטל)\nשולם 3500ש\"ח בהעברה בנקאית\nהופקה קבלה מספר 2174 תיק 67 (אורטל)",
  },
  {
    name: "לירון נחמן",
    itemId: "2944983730",
    text: "ביצעה העברה בנקאית על סך 1000 שח תצא קבלה כשיופיע בחשבון\nההעברה על שם ליז נחמן\nהעברה ע'ס 1000ש\"ח נקלטה הופקה קבלה מספר 1674 תיק 67 (אורטל)",
  },
];

async function main(): Promise<void> {
  console.log("Adding deposit notes to February events...\n");

  for (const u of updates) {
    await gql<{ change_multiple_column_values: { id: string } }>(
      `mutation ($b: ID!, $i: ID!, $cv: JSON!) {
        change_multiple_column_values(board_id: $b, item_id: $i, column_values: $cv) { id }
      }`,
      {
        b: BOARD,
        i: u.itemId,
        cv: JSON.stringify({ [COL_DEPOSIT_NOTES]: { text: u.text } }),
      },
    );
    console.log(`  ✓ ${u.name}`);
  }

  console.log("\nDone — 5 deposit notes added");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
