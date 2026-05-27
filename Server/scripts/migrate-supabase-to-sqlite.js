// One-shot Supabase → SQLite migration (plain JS, ESM).
// Designed to run inside the production crm container via:
//   docker cp migrate.js root-crm-1:/tmp/migrate.js && docker exec root-crm-1 node /tmp/migrate.js

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_PATH = process.env.DB_FILE_PATH ?? "/data/crm.sqlite";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function fetchTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  return await res.json();
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS processed_webhooks (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, external_id TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(source, external_id));
CREATE TABLE IF NOT EXISTS known_senders (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, sender_id TEXT NOT NULL, sender_username TEXT, monday_item_id TEXT NOT NULL, phone TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(platform, sender_id));
CREATE TABLE IF NOT EXISTS followup_log (id INTEGER PRIMARY KEY AUTOINCREMENT, monday_item_id TEXT NOT NULL, phone TEXT NOT NULL, lead_name TEXT, last_call_date TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(monday_item_id, last_call_date));
CREATE TABLE IF NOT EXISTS holiday_campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, holiday_date TEXT NOT NULL UNIQUE, holiday_name TEXT NOT NULL, holiday_hebrew TEXT, prompt_sent_at TEXT, prompt_message_id TEXT, reply_text TEXT, reply_received_at TEXT, status TEXT NOT NULL DEFAULT 'pending_prompt', broadcast_started_at TEXT, broadcast_finished_at TEXT, total_recipients INTEGER DEFAULT 0, total_sent INTEGER DEFAULT 0, total_failed INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), form_token TEXT, send_date TEXT);
CREATE TABLE IF NOT EXISTS holiday_campaign_sends (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL REFERENCES holiday_campaigns(id), monday_item_id TEXT, phone TEXT, lead_name TEXT, status TEXT NOT NULL, sent_at TEXT, error_message TEXT, UNIQUE(campaign_id, phone));
`;

const dir = dirname(DB_PATH);
if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
const db = new Database(DB_PATH);
db.exec(SCHEMA);

console.log("Reading from:", SUPABASE_URL);
console.log("Writing to:", DB_PATH);

// processed_webhooks
{
  const rows = await fetchTable("processed_webhooks");
  const stmt = db.prepare("INSERT OR IGNORE INTO processed_webhooks (source, external_id, processed_at) VALUES (?, ?, ?)");
  db.transaction(() => { for (const r of rows) stmt.run(r.source, r.external_id, r.processed_at); })();
  console.log(`processed_webhooks: ${rows.length} rows`);
}

// known_senders
{
  const rows = await fetchTable("known_senders");
  const stmt = db.prepare("INSERT OR IGNORE INTO known_senders (platform, sender_id, sender_username, monday_item_id, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  db.transaction(() => { for (const r of rows) stmt.run(r.platform, r.sender_id, r.sender_username, r.monday_item_id, r.phone, r.created_at, r.updated_at); })();
  console.log(`known_senders: ${rows.length} rows`);
}

// followup_log
{
  const rows = await fetchTable("followup_log");
  const stmt = db.prepare("INSERT OR IGNORE INTO followup_log (monday_item_id, phone, lead_name, last_call_date, sent_at) VALUES (?, ?, ?, ?, ?)");
  db.transaction(() => { for (const r of rows) stmt.run(r.monday_item_id, r.phone, r.lead_name, r.last_call_date, r.sent_at); })();
  console.log(`followup_log: ${rows.length} rows`);
}

// holiday_campaigns (preserve id)
{
  const rows = await fetchTable("holiday_campaigns");
  const stmt = db.prepare("INSERT OR IGNORE INTO holiday_campaigns (id, holiday_date, holiday_name, holiday_hebrew, prompt_sent_at, prompt_message_id, reply_text, reply_received_at, status, broadcast_started_at, broadcast_finished_at, total_recipients, total_sent, total_failed, created_at, form_token, send_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  db.transaction(() => {
    for (const r of rows) stmt.run(r.id, r.holiday_date, r.holiday_name, r.holiday_hebrew, r.prompt_sent_at, r.prompt_message_id, r.reply_text, r.reply_received_at, r.status, r.broadcast_started_at, r.broadcast_finished_at, r.total_recipients, r.total_sent, r.total_failed, r.created_at, r.form_token, r.send_date);
  })();
  console.log(`holiday_campaigns: ${rows.length} rows`);
}

// holiday_campaign_sends
{
  const rows = await fetchTable("holiday_campaign_sends");
  const stmt = db.prepare("INSERT OR IGNORE INTO holiday_campaign_sends (campaign_id, monday_item_id, phone, lead_name, status, sent_at, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)");
  db.transaction(() => { for (const r of rows) stmt.run(r.campaign_id, r.monday_item_id, r.phone, r.lead_name, r.status, r.sent_at, r.error_message); })();
  console.log(`holiday_campaign_sends: ${rows.length} rows`);
}

// Final counts
console.log("\nFinal SQLite row counts:");
for (const t of ["processed_webhooks","known_senders","followup_log","holiday_campaigns","holiday_campaign_sends"]) {
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get();
  console.log(`  ${t}: ${count}`);
}

db.close();
console.log("\nDone:", DB_PATH);
