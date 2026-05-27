/**
 * One-shot: restructure the Uman board columns to match the Google Sheet
 * for the ט"ו באב אומן trip, then seed all 16 client rows.
 *
 * Steps:
 *   1. Query current columns on the Uman board
 *   2. Delete columns not present in the sheet
 *   3. Create missing columns
 *   4. Seed 16 rows into the ט"ו באב אומן group
 *
 * Run with:  cd Server && npx tsx scripts/setup-uman-tu-bav.ts
 */

import dotenv from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";

dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("MONDAY_API_TOKEN missing");
  process.exit(1);
}

const UMAN_BOARD_ID = "5097312406";

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN!,
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

interface ExistingColumn {
  id: string;
  title: string;
  type: string;
}

interface ColumnSpec {
  title: string;
  type: string;
  defaults?: string;
}

interface Group {
  id: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Column plan — keep these titles (case-sensitive Hebrew)
// ---------------------------------------------------------------------------

const KEEP_TITLES = new Set([
  "Name",        // built-in name column
  "Phone",       // phone column
  "Paid",        // status כן/לא
  "גיל",         // Age (numbers)
  "עיר",          // City (text)
]);

const COLUMNS_TO_CREATE: ColumnSpec[] = [
  { title: "הערות", type: "long_text" },
  { title: "סכום", type: "numbers" },
  { title: "אמצעי תשלום", type: "text" },
  { title: "סכום ששולם", type: "numbers" },
  { title: "סוכנת", type: "text" },
  { title: "שיווק", type: "text" },
  {
    title: "דרכון",
    type: "dropdown",
    defaults: JSON.stringify({
      settings: {
        labels: [
          { id: 1, name: "יש" },
          { id: 2, name: "בהנפקה" },
        ],
      },
    }),
  },
  { title: "טפסים", type: "text" },
  { title: "חדר", type: "text" },
  { title: "הערות תשלום", type: "long_text" },
];

// ---------------------------------------------------------------------------
// Step 1 — Query current columns
// ---------------------------------------------------------------------------

async function getCurrentColumns(): Promise<ExistingColumn[]> {
  const data = await gql<{ boards: Array<{ columns: ExistingColumn[] }> }>(
    `query ($b: [ID!]!) { boards(ids: $b) { columns { id title type } } }`,
    { b: [UMAN_BOARD_ID] },
  );
  return data.boards[0]?.columns ?? [];
}

async function getGroups(): Promise<Group[]> {
  const data = await gql<{ boards: Array<{ groups: Group[] }> }>(
    `query ($b: [ID!]!) { boards(ids: $b) { groups { id title } } }`,
    { b: [UMAN_BOARD_ID] },
  );
  return data.boards[0]?.groups ?? [];
}

// ---------------------------------------------------------------------------
// Step 2 — Delete columns not in the sheet
// ---------------------------------------------------------------------------

async function deleteColumn(columnId: string, title: string): Promise<void> {
  await gql<{ delete_column: { id: string } }>(
    `mutation ($boardId: ID!, $columnId: String!) {
      delete_column(board_id: $boardId, column_id: $columnId) { id }
    }`,
    { boardId: UMAN_BOARD_ID, columnId },
  );
  console.log(`  DELETE: "${title}" (${columnId})`);
}

// ---------------------------------------------------------------------------
// Step 3 — Create missing columns
// ---------------------------------------------------------------------------

async function createColumn(
  spec: ColumnSpec,
  afterColumnId?: string,
): Promise<string> {
  const variables: Record<string, unknown> = {
    boardId: UMAN_BOARD_ID,
    title: spec.title,
    columnType: spec.type,
  };
  if (spec.defaults) variables.defaults = spec.defaults;
  if (afterColumnId) variables.afterColumnId = afterColumnId;

  const result = await gql<{ create_column: { id: string; title: string; type: string } }>(
    `mutation (
      $boardId: ID!
      $title: String!
      $columnType: ColumnType!
      $defaults: JSON
      $afterColumnId: ID
    ) {
      create_column(
        board_id: $boardId
        title: $title
        column_type: $columnType
        defaults: $defaults
        after_column_id: $afterColumnId
      ) { id title type }
    }`,
    variables,
  );

  const id = result.create_column.id;
  console.log(`  CREATE: "${spec.title}" (${spec.type}) → ${id}`);
  return id;
}

// ---------------------------------------------------------------------------
// Step 4 — Seed rows
// ---------------------------------------------------------------------------

interface ClientRow {
  name: string;
  phone?: string;
  notes?: string;
  age?: number;
  amount?: number;
  paymentMethod?: string;
  amountPaid?: number;
  agent?: string;
  marketing?: string;
  city?: string;
  passport?: string;
  forms?: string;
  room?: string;
  paymentNotes?: string;
}

const CLIENTS: ClientRow[] = [
  {
    name: "שירה אנג'ל גבאי סבח",
    phone: "053-2424740",
    age: 18,
    amount: 5700,
    paymentMethod: "העברה",
    amountPaid: 5700,
    agent: "אורטל",
    passport: "יש",
    forms: "במערכת",
    room: "לבד",
    paymentNotes: "הנוסעת עברה מנסיעת מרץ שבוטלה לנסיעה הנוכחית\nהוסיפה 500ש\"ח עבור הנסיעה של טו באב\nהופקה קבלה מספר 2214 תיק 80 (אורטל)",
  },
  {
    name: "חן רחמנוב",
    phone: "053-7290091",
    age: 21,
    amount: 5900,
    paymentMethod: "העברה",
    amountPaid: 5900,
    agent: "אורטל",
    passport: "יש",
    forms: "במערכת",
    room: "לבד",
    paymentNotes: "עברה מנסיה במרץ שבוטלה והוסיפה בהעברה בנקאית 700ש\"ח עבור הנסיעה הנוכחית\nהופקה קבלה מספר 2249 תיק 85 (אורטל)",
  },
  {
    name: "שרה שיפרה גליק",
    phone: "058-4040925",
    age: 24,
    amount: 5900,
    paymentMethod: "העברה",
    amountPaid: 5900,
    agent: "אורטל",
    marketing: "אינסטגרם",
    passport: "יש",
    forms: "במערכת",
    room: "שרה שפרה גליק",
    paymentNotes: "תבצע העברה היום בערב (אורטל)\nשולם בהעברה בנקאית 5900ש\"ח\nהופקה קבלה מספר 2253 תיק 85 (אורטל)",
  },
  {
    name: "ברטי וויזל",
    phone: "050-6787781",
    age: 22,
    amount: 5900,
    paymentMethod: "העברה",
    amountPaid: 5900,
    agent: "אורטל",
    marketing: "אינסטגרם",
    passport: "יש",
    forms: "במערכת",
    room: "שרה שפרה גליק",
    paymentNotes: "תבצע העברה היום בערב (אורטל)\nשולם בהעברה בנקאית 5900ש\"ח\nהופקה קבלה מספר 2254 תיק 85 (אורטל)",
  },
  {
    name: "רבקה ליאור מגידיש",
    phone: "050-7800037",
    age: 23,
    amount: 5900,
    paymentMethod: "העברה",
    amountPaid: 11800,
    agent: "אורטל",
    marketing: "אינסטגרם",
    passport: "יש",
    room: "רבקה ליאור מגידיש",
    paymentNotes: "האמא ביצעה העברה בנקאית ע'ס 11800ש\"ח העברה טרם נקלטה ולכן לא הופקה קבלה (אורטל)\nבוצעה העברה ע'ס 11800ש\"ח מהחשבון של האמא\nהופקה קבלה מספר 2256 תיק 85 (אורטל)",
  },
  {
    name: "אוריה ברטה סלע",
    phone: "058-6213888",
    notes: "טלפון של האמא איריס 052-5000860",
    age: 14,
    amount: 5900,
    paymentMethod: "העברה",
    agent: "אורטל",
    marketing: "אינסטגרם",
    passport: "בהנפקה",
    room: "רבקה ליאור מגידיש",
  },
  {
    name: "ליהיא אדל ברש",
  },
  {
    name: "לורן שרה מירל",
    phone: "050-5786977",
    age: 23,
    amount: 5900,
    paymentMethod: "העברה",
    amountPaid: 5900,
    passport: "יש",
    forms: "במערכת",
    room: "לבד",
    paymentNotes: "עברה מנסיעה בחודש מרץ שבוטלה והוסיפה 700ש\"ח בהעברה בנקאית\nהופקה קבלה מספר 2257 תיק 85 (אורטל)",
  },
  {
    name: "טליה רווח",
    phone: "052-6841408",
    amount: 5900,
    amountPaid: 4500,
  },
  {
    name: "מעיין נוריאל",
    phone: "050-9014668",
    age: 27,
    amount: 5900,
    paymentMethod: "העברה",
    amountPaid: 5900,
    agent: "אורטל",
    marketing: "אינסטגרם",
    passport: "יש",
    room: "מעיין נוריאל",
    paymentNotes: "ביצעה העברה בנקאית ע'ס 5900ש\"ח העברה טרם נקלטה ולכן לא הופקה קבלה(אורטל)\nהעברה ע'ס 5900ש\"ח נקלטה במערכת\nהופקה קבלה מספר 2261 תיק 85 (אורטל)",
  },
  {
    name: "טליה רות עטיה",
    phone: "053-2737992",
    age: 27,
    amount: 5900,
    paymentMethod: "העברה",
    amountPaid: 5900,
    agent: "אורטל",
    marketing: "אינסטגרם",
    passport: "יש",
    forms: "במערכת",
    room: "מעיין נוריאל",
    paymentNotes: "ביצעה העברה בנקאית ע'ס 5900ש\"ח העברה טרם נקלטה ולכן לא הופקה קבלה (אורטל)\nהעברה ע'ס 5900ש\"ח נקלטה במערכת\nהופקה קבלה מספר 2262 תיק 85 (אורטל)",
  },
  {
    name: "אביגיל הנה",
    phone: "053-3701386",
    age: 27,
    amount: 5900,
    paymentMethod: "אשראי",
    amountPaid: 5900,
    agent: "אורטל",
    marketing: "אינסטגרם",
    city: "ביתר עילית",
    passport: "יש",
    forms: "במערכת",
    room: "לבד",
    paymentNotes: "שולם באשראי 5900ש\"ח +3% עמלת סליקה ב-10 תשלומים\nהופקה קבלה מספר 2259 תיק 85 (אורטל)",
  },
  {
    name: "מרים דוק",
    phone: "054-8282859",
    age: 25,
    amount: 5900,
    paymentMethod: "אשראי",
    amountPaid: 5900,
    agent: "אורטל",
    marketing: "אינסטגרם",
    city: "כרמיאל",
    passport: "יש",
    room: "מרים דוק",
    paymentNotes: "שולם באשראי 5900ש\"ח +3% עמלת סליקה ב-12 תשלומים\nהופקה קבלה מספר 2260 תיק 85 (אורטל)",
  },
  {
    name: "אוראל אדרי",
    phone: "050-2174421",
    notes: "רגישות לאגוזים (לא מסכן חיים)",
    age: 25,
    amount: 5900,
    paymentMethod: "אשראי",
    marketing: "אינסטגרם",
    city: "קרית אתא",
    passport: "יש",
    forms: "במערכת",
    room: "מרים דוק",
  },
  {
    name: "שירן (הבטם) אדונייה",
    phone: "054-2530551",
    age: 27,
    marketing: "אינסטגרם",
    passport: "יש",
    room: "יעל טשאלה",
  },
  {
    name: "יעל טשאלה",
    phone: "058-4623524",
    marketing: "אינסטגרם",
    room: "יעל טשאלה",
  },
];

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) return "+972" + digits.slice(1);
  return digits;
}

async function seedRow(
  groupId: string,
  client: ClientRow,
  columnMap: Record<string, string>,
): Promise<string> {
  const cv: Record<string, unknown> = {};

  if (client.phone && columnMap.Phone) {
    cv[columnMap.Phone] = { phone: normalizePhone(client.phone), countryShortName: "IL" };
  }
  if (client.notes && columnMap["הערות"]) {
    cv[columnMap["הערות"]] = { text: client.notes };
  }
  if (client.age != null && columnMap["גיל"]) {
    cv[columnMap["גיל"]] = String(client.age);
  }
  if (client.amount != null && columnMap["סכום"]) {
    cv[columnMap["סכום"]] = String(client.amount);
  }
  if (client.paymentMethod && columnMap["אמצעי תשלום"]) {
    cv[columnMap["אמצעי תשלום"]] = client.paymentMethod;
  }
  if (client.amountPaid != null && columnMap["סכום ששולם"]) {
    cv[columnMap["סכום ששולם"]] = String(client.amountPaid);
  }
  if (client.agent && columnMap["סוכנת"]) {
    cv[columnMap["סוכנת"]] = client.agent;
  }
  if (client.marketing && columnMap["שיווק"]) {
    cv[columnMap["שיווק"]] = client.marketing;
  }
  if (client.city && columnMap["עיר"]) {
    cv[columnMap["עיר"]] = client.city;
  }
  if (client.passport && columnMap["דרכון"]) {
    const label = client.passport;
    const labelId = label === "יש" ? 1 : label === "בהנפקה" ? 2 : null;
    if (labelId) cv[columnMap["דרכון"]] = { ids: [labelId] };
  }
  if (client.forms && columnMap["טפסים"]) {
    cv[columnMap["טפסים"]] = client.forms;
  }
  if (client.room && columnMap["חדר"]) {
    cv[columnMap["חדר"]] = client.room;
  }
  if (client.paymentNotes && columnMap["הערות תשלום"]) {
    cv[columnMap["הערות תשלום"]] = { text: client.paymentNotes };
  }

  const result = await gql<{ create_item: { id: string } }>(
    `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
    }`,
    {
      boardId: UMAN_BOARD_ID,
      groupId,
      itemName: client.name,
      columnValues: JSON.stringify(cv),
    },
  );

  return result.create_item.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Step 1 — Query current columns
  console.log(`\n=== Uman board (${UMAN_BOARD_ID}) — current columns ===`);
  const columns = await getCurrentColumns();
  for (const c of columns) {
    console.log(`  ${c.id} | ${c.title} (${c.type})`);
  }

  // Step 2 — Delete columns not in the sheet
  console.log("\n=== Deleting columns not in the sheet ===");
  const keepIds = new Set<string>();
  for (const c of columns) {
    if (c.id === "name" || KEEP_TITLES.has(c.title)) {
      keepIds.add(c.id);
      console.log(`  KEEP: "${c.title}" (${c.id})`);
    }
  }

  for (const c of columns) {
    if (!keepIds.has(c.id) && c.id !== "name") {
      await deleteColumn(c.id, c.title);
    }
  }

  // Step 3 — Create missing columns
  console.log("\n=== Creating columns to match the sheet ===");
  const refreshed = await getCurrentColumns();
  const existingTitles = new Set(refreshed.map((c) => c.title));

  const columnMap: Record<string, string> = {};
  for (const c of refreshed) {
    columnMap[c.title] = c.id;
  }

  let lastCreatedId: string | undefined;
  for (const spec of COLUMNS_TO_CREATE) {
    if (existingTitles.has(spec.title)) {
      const existing = refreshed.find((c) => c.title === spec.title)!;
      console.log(`  SKIP: "${spec.title}" already exists (${existing.id})`);
      columnMap[spec.title] = existing.id;
      lastCreatedId = existing.id;
      continue;
    }
    const id = await createColumn(spec, lastCreatedId);
    columnMap[spec.title] = id;
    lastCreatedId = id;
  }

  console.log("\n=== Final column map ===");
  for (const [title, id] of Object.entries(columnMap)) {
    console.log(`  ${title} → ${id}`);
  }

  // Step 4 — Find the ט"ו באב אומן group
  const groups = await getGroups();
  console.log("\n=== Groups ===");
  for (const g of groups) {
    console.log(`  ${g.id} | ${g.title}`);
  }

  const tuBavGroup = groups.find((g) => /טו.*באב|tu.*bav/i.test(g.title) || g.title.includes("ט\"ו באב"));
  if (!tuBavGroup) {
    console.error("Could not find ט\"ו באב אומן group! Available groups:");
    for (const g of groups) console.error(`  - "${g.title}" (${g.id})`);
    process.exit(1);
  }
  console.log(`\nTarget group: "${tuBavGroup.title}" (${tuBavGroup.id})`);

  // Step 5 — Seed rows
  console.log("\n=== Seeding 16 client rows ===");
  const results: Array<{ name: string; itemId: string }> = [];

  for (const client of CLIENTS) {
    const itemId = await seedRow(tuBavGroup.id, client, columnMap);
    console.log(`  ✓ ${client.name} → ${itemId}`);
    results.push({ name: client.name, itemId });
  }

  // Save output
  mkdirSync("scripts/output", { recursive: true });
  const outPath = "scripts/output/uman-tu-bav-seed.json";
  writeFileSync(outPath, JSON.stringify({ columnMap, groupId: tuBavGroup.id, rows: results }, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`\nDone — ${results.length} rows seeded into "${tuBavGroup.title}"`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
