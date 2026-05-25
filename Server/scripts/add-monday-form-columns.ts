/**
 * One-shot: add the 7 new columns to the CRM board for the website form.
 * Idempotent — skips any column whose title already exists.
 *
 * Run with:  cd Server && npx tsx scripts/add-monday-form-columns.ts
 *
 * Outputs a JSON file at scripts/output/form-column-ids.json with the
 * column IDs, so they can be pasted into env.ts as defaults.
 */

import dotenv from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";

dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("MONDAY_API_TOKEN missing");
  process.exit(1);
}

const BOARDS = [
  { name: "CRM",     id: process.env.MONDAY_BOARD_CRM_ID    ?? "5094895163" },
  { name: "Uman",    id: process.env.MONDAY_BOARD_UMAN_ID   ?? "5095155009" },
  { name: "Poland",  id: process.env.MONDAY_BOARD_POLAND_ID ?? "5095155041" },
  { name: "Challah", id: process.env.MONDAY_BOARD_CHALLAH_ID?? "5095155077" },
];

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

const COLUMNS_TO_ADD: ColumnSpec[] = [
  { title: "גיל", type: "numbers" },
  { title: "תאריך לידה", type: "date" },
  { title: "עיר", type: "text" },
  { title: "עיסוק", type: "text" },
  {
    title: "סוג טלפון",
    type: "dropdown",
    defaults: JSON.stringify({
      settings: {
        labels: [
          { id: 1, name: "כשר" },
          { id: 2, name: "רגיל" },
        ],
      },
    }),
  },
  {
    title: "דרכון",
    type: "dropdown",
    defaults: JSON.stringify({
      settings: {
        labels: [
          { id: 1, name: "כן" },
          { id: 2, name: "לא" },
        ],
      },
    }),
  },
  { title: "מייל", type: "email" },
];

async function processBoard(boardLabel: string, boardId: string): Promise<Record<string, string>> {
  console.log(`\n=== Board: ${boardLabel} (${boardId}) ===`);
  const existing = await gql<{ boards: Array<{ columns: ExistingColumn[] }> }>(
    `query ($b: [ID!]!) { boards(ids: $b) { columns { id title type } } }`,
    { b: [boardId] },
  );
  const cols = existing.boards[0]?.columns ?? [];

  const existingTitles = new Set(cols.map((c) => c.title));
  const priceQuote = cols.find((c) => /price.*quote|price_quote|prce|הצעה|הצעת/i.test(c.title));
  let afterColumnId: string | undefined = priceQuote?.id;
  console.log(`Anchor column "${priceQuote?.title ?? "(none — appending at end)"}" → ${afterColumnId ?? "n/a"}`);

  const created: Record<string, string> = {};

  for (const spec of COLUMNS_TO_ADD) {
    if (existingTitles.has(spec.title)) {
      const existingCol = cols.find((c) => c.title === spec.title)!;
      console.log(`  SKIP: "${spec.title}" already exists (${existingCol.id})`);
      created[spec.title] = existingCol.id;
      afterColumnId = existingCol.id;
      continue;
    }

    interface CreateColumnResponse { create_column: { id: string; title: string; type: string } }

    const variables: Record<string, unknown> = {
      boardId,
      title: spec.title,
      columnType: spec.type,
    };
    if (spec.defaults) variables.defaults = spec.defaults;
    if (afterColumnId) variables.afterColumnId = afterColumnId;

    const result = await gql<CreateColumnResponse>(
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
    created[spec.title] = id;
    afterColumnId = id;
    console.log(`  CREATE: "${spec.title}" (${spec.type}) → ${id}`);
  }

  return created;
}

async function main() {
  const all: Record<string, Record<string, string>> = {};
  for (const board of BOARDS) {
    all[board.name] = await processBoard(board.name, board.id);
  }

  mkdirSync("scripts/output", { recursive: true });
  const outPath = "scripts/output/form-column-ids.json";
  writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
