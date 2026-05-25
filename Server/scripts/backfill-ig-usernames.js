// Backfill IG usernames for known_senders rows that have null sender_username,
// AND rename the corresponding Monday items (currently "Unknown IG lead").
//
// Run inside the production crm container:
//   docker cp backfill-ig-usernames.js root-crm-1:/app/
//   docker exec --user node -w /app root-crm-1 node backfill-ig-usernames.js

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

const IG_TOKEN_FILE = process.env.META_TOKEN_FILE_PATH ?? "/data/meta-token.json";
const DB_PATH = process.env.DB_FILE_PATH ?? "/data/crm.sqlite";
const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD = process.env.MONDAY_BOARD_CRM_ID ?? "5094895163";

if (!MONDAY_TOKEN) {
  console.error("MONDAY_API_TOKEN missing");
  process.exit(1);
}

let igToken;
try {
  const data = JSON.parse(readFileSync(IG_TOKEN_FILE, "utf8"));
  igToken = data.ig_access_token;
} catch (err) {
  console.error("Cannot read IG token file:", err.message);
  process.exit(1);
}

async function fetchIgProfile(senderId) {
  const url = `https://graph.instagram.com/v23.0/${encodeURIComponent(senderId)}?fields=name,username&access_token=${encodeURIComponent(igToken)}`;
  const r = await fetch(url);
  if (!r.ok) {
    console.error(`  IG profile fetch ${r.status} for ${senderId}: ${(await r.text()).slice(0, 200)}`);
    return null;
  }
  return await r.json();
}

async function renameMondayItem(itemId, newName) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_TOKEN,
      "API-Version": "2025-04",
    },
    body: JSON.stringify({
      query: `mutation ($boardId: ID!, $itemId: ID!, $value: String!) {
        change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: "name", value: $value) { id }
      }`,
      variables: { boardId: MONDAY_BOARD, itemId: String(itemId), value: newName },
    }),
  });
  const json = await r.json();
  if (json.errors) {
    throw new Error(`Monday rename failed: ${JSON.stringify(json.errors)}`);
  }
  return json.data?.change_simple_column_value?.id;
}

const db = new Database(DB_PATH);
const rows = db.prepare(
  "SELECT sender_id, monday_item_id FROM known_senders WHERE platform = 'instagram' AND sender_username IS NULL",
).all();
console.log(`Found ${rows.length} known_senders rows with null sender_username`);

const updateStmt = db.prepare(
  "UPDATE known_senders SET sender_username = ?, updated_at = datetime('now') WHERE platform = 'instagram' AND sender_id = ?",
);

let updated = 0;
let skipped = 0;

for (const row of rows) {
  console.log(`\nSender ${row.sender_id} (Monday item ${row.monday_item_id}):`);
  const profile = await fetchIgProfile(row.sender_id);
  if (!profile) {
    console.log("  → no profile, skipping");
    skipped++;
    continue;
  }
  console.log(`  → name=${profile.name ?? "(none)"} username=${profile.username ?? "(none)"}`);

  if (!profile.username) {
    console.log("  → no username, skipping Monday rename");
    skipped++;
    continue;
  }

  try {
    await renameMondayItem(row.monday_item_id, profile.username);
    console.log(`  → Monday item renamed to "${profile.username}"`);
    updateStmt.run(profile.username, row.sender_id);
    console.log("  → known_senders.sender_username updated");
    updated++;
  } catch (err) {
    console.error("  → FAILED:", err.message);
    skipped++;
  }
}

console.log(`\nDone. Updated: ${updated} | Skipped: ${skipped}`);
db.close();
