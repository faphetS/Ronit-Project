/**
 * One-shot: add a single "הודעה אחרונה באינסטגרם" (Last IG message) long_text
 * column to all 4 Monday boards (CRM, Uman, Poland, Challah).
 * Idempotent — skips any board where a column with that exact title already exists.
 *
 * Run with:  cd Server && npx tsx scripts/add-last-ig-message-column.ts
 *
 * Outputs scripts/output/last-ig-message-column-ids.json with the per-board
 * column IDs. The CRM one goes into Server/.env as MONDAY_COL_LAST_IG_MESSAGE_ID.
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

const COLUMN_TITLE = "הודעה אחרונה באינסטגרם";
const COLUMN_TYPE = "long_text";
// Anchor after the existing "שלב הבא -" long_text column so similar text fields
// stay grouped. We resolve the anchor ID per-board by title.
const ANCHOR_TITLE = "שלב הבא -";

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

interface CreateColumnResponse {
  create_column: { id: string; title: string; type: string };
}

async function processBoard(boardLabel: string, boardId: string): Promise<string> {
  console.log(`\n=== Board: ${boardLabel} (${boardId}) ===`);
  const existing = await gql<{ boards: Array<{ columns: ExistingColumn[] }> }>(
    `query ($b: [ID!]!) { boards(ids: $b) { columns { id title type } } }`,
    { b: [boardId] },
  );
  const cols = existing.boards[0]?.columns ?? [];

  const already = cols.find((c) => c.title === COLUMN_TITLE);
  if (already) {
    console.log(`  SKIP: "${COLUMN_TITLE}" already exists (${already.id})`);
    return already.id;
  }

  const anchor = cols.find((c) => c.title === ANCHOR_TITLE);
  console.log(`  Anchor "${ANCHOR_TITLE}" → ${anchor?.id ?? "(none — appending at end)"}`);

  const variables: Record<string, unknown> = {
    boardId,
    title: COLUMN_TITLE,
    columnType: COLUMN_TYPE,
  };
  if (anchor?.id) variables.afterColumnId = anchor.id;

  const result = await gql<CreateColumnResponse>(
    `mutation (
      $boardId: ID!
      $title: String!
      $columnType: ColumnType!
      $afterColumnId: ID
    ) {
      create_column(
        board_id: $boardId
        title: $title
        column_type: $columnType
        after_column_id: $afterColumnId
      ) { id title type }
    }`,
    variables,
  );

  const id = result.create_column.id;
  console.log(`  CREATE: "${COLUMN_TITLE}" (${COLUMN_TYPE}) → ${id}`);
  return id;
}

async function main(): Promise<void> {
  const all: Record<string, string> = {};
  for (const board of BOARDS) {
    all[board.name] = await processBoard(board.name, board.id);
  }

  mkdirSync("scripts/output", { recursive: true });
  const outPath = "scripts/output/last-ig-message-column-ids.json";
  writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`\nPaste into Server/.env:  MONDAY_COL_LAST_IG_MESSAGE_ID=${all.CRM}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
