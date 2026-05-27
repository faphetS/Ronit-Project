/**
 * Seed 2 missing January events + fix event type on בירנית מנוח.
 * Run with:  cd Server && npx tsx scripts/seed-challah-jan-extra.ts
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
  amount: "text_mm3rckd0",
  city: "text_mm3pf74e",
  address: "text_mm3rwmag",
  eventType: "text_mm3r8e1m",
  forms: "text_mm3r7qvw",
  deposit: "numeric_mm3r14gy",
  notes: "long_text_mm3r3n0w",
};

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
  // 1. Fix בירנית מנוח event type (item 2944902732)
  console.log("Fixing בירנית מנוח event type...");
  await gql<{ change_simple_column_value: { id: string } }>(
    `mutation ($b: ID!, $i: ID!, $c: String!, $v: String!) {
      change_simple_column_value(board_id: $b, item_id: $i, column_id: $c, value: $v) { id }
    }`,
    { b: BOARD, i: "2944902732", c: COL.eventType, v: "הפרשת חלה+שיעור תורה לכלה+תפאורת חינה" },
  );
  console.log("  ✓ Updated event type");

  // 2. Add שיר יעקב (24/1/26)
  const row4 = await gql<{ create_item: { id: string } }>(
    `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
      create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
    }`,
    {
      b: BOARD,
      g: GROUP,
      n: "שיר יעקב",
      cv: JSON.stringify({
        [COL.date]: { date: "2026-01-24" },
        [COL.dayOfWeek]: "שבת",
        [COL.city]: "בן זכאי",
        [COL.eventType]: "שיעור תורה פתוח",
      }),
    },
  );
  console.log(`  ✓ שיר יעקב → ${row4.create_item.id}`);

  // 3. Add שיעור תורה לעילוי נשמת עופרה (25/1/26)
  const row5 = await gql<{ create_item: { id: string } }>(
    `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
      create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
    }`,
    {
      b: BOARD,
      g: GROUP,
      n: "שיעור תורה לעילוי נשמת עופרה",
      cv: JSON.stringify({
        [COL.date]: { date: "2026-01-25" },
        [COL.dayOfWeek]: "ראשון",
        [COL.tz]: "שיעור תורה לעילוי נשמת עופרה ז\"ל",
        [COL.amount]: "ללא תשלום",
        [COL.city]: "מושב עוזיאל",
        [COL.address]: "בית הכנסת משכן יעקב",
      }),
    },
  );
  console.log(`  ✓ שיעור תורה לעילוי נשמת עופרה → ${row5.create_item.id}`);

  console.log("\nDone — 2 rows added, 1 updated");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
