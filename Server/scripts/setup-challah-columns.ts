/**
 * One-shot: restructure the Challah board columns to match the Google Sheet
 * "הפרשות חלה 2026".
 *
 * Steps:
 *   1. Query current columns on the Challah board
 *   2. Delete columns not present in the sheet
 *   3. Create missing columns
 *   4. Rename kept columns to Hebrew
 *
 * Run with:  cd Server && npx tsx scripts/setup-challah-columns.ts
 */

import dotenv from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";

dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("MONDAY_API_TOKEN missing");
  process.exit(1);
}

const CHALLAH_BOARD_ID = "5095155077";

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

interface ExistingColumn { id: string; title: string; type: string }

interface ColumnSpec { title: string; type: string; defaults?: string }

const KEEP_TITLES = new Set(["Name", "Phone", "עיר"]);

const COLUMNS_TO_CREATE: ColumnSpec[] = [
  { title: "תאריך", type: "date" },
  { title: "יום בשבוע", type: "text" },
  { title: "ת.ז", type: "text" },
  { title: "סוכן", type: "text" },
  { title: "סכום+אשראי", type: "text" },
  { title: "כתובת", type: "text" },
  { title: "סוג האירוע", type: "text" },
  { title: "טפסים", type: "text" },
  { title: "מקדמה", type: "numbers" },
  { title: "הערות", type: "long_text" },
];

async function getCurrentColumns(): Promise<ExistingColumn[]> {
  const data = await gql<{ boards: Array<{ columns: ExistingColumn[] }> }>(
    `query ($b: [ID!]!) { boards(ids: $b) { columns { id title type } } }`,
    { b: [CHALLAH_BOARD_ID] },
  );
  return data.boards[0]?.columns ?? [];
}

async function deleteColumn(columnId: string, title: string): Promise<void> {
  await gql<{ delete_column: { id: string } }>(
    `mutation ($boardId: ID!, $columnId: String!) {
      delete_column(board_id: $boardId, column_id: $columnId) { id }
    }`,
    { boardId: CHALLAH_BOARD_ID, columnId },
  );
  console.log(`  DELETE: "${title}" (${columnId})`);
}

async function createColumn(spec: ColumnSpec, afterColumnId?: string): Promise<string> {
  const variables: Record<string, unknown> = {
    boardId: CHALLAH_BOARD_ID,
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

async function renameColumn(columnId: string, newTitle: string): Promise<void> {
  await gql<{ change_column_metadata: { id: string; title: string } }>(
    `mutation { change_column_metadata(board_id: ${CHALLAH_BOARD_ID}, column_id: "${columnId}", column_property: title, value: "${newTitle}") { id title } }`,
  );
  console.log(`  RENAME: ${columnId} → "${newTitle}"`);
}

async function main(): Promise<void> {
  // Step 1 — Query current columns
  console.log(`\n=== Challah board (${CHALLAH_BOARD_ID}) — current columns ===`);
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

  // Step 4 — Rename kept columns to Hebrew
  console.log("\n=== Renaming columns to Hebrew ===");
  await renameColumn("name", "שם המזמינה");
  columnMap["שם המזמינה"] = "name";

  await renameColumn("phone_mm2pf4nm", "טלפון");
  columnMap["טלפון"] = "phone_mm2pf4nm";

  // Step 5 — Final column map
  console.log("\n=== Final column map ===");
  for (const [title, id] of Object.entries(columnMap)) {
    console.log(`  ${title} → ${id}`);
  }

  mkdirSync("scripts/output", { recursive: true });
  const outPath = "scripts/output/challah-column-ids.json";
  writeFileSync(outPath, JSON.stringify(columnMap, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
