import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { env } from "./env.js";
import { logger } from "./logger.js";

let db: Database.Database | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS known_senders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_username TEXT,
  monday_item_id TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, sender_id)
);

CREATE TABLE IF NOT EXISTS followup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monday_item_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  lead_name TEXT,
  last_call_date TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(monday_item_id, last_call_date)
);

CREATE TABLE IF NOT EXISTS holiday_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date TEXT NOT NULL UNIQUE,
  holiday_name TEXT NOT NULL,
  holiday_hebrew TEXT,
  prompt_sent_at TEXT,
  prompt_message_id TEXT,
  reply_text TEXT,
  reply_received_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending_prompt',
  broadcast_started_at TEXT,
  broadcast_finished_at TEXT,
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  form_token TEXT,
  send_date TEXT
);

CREATE TABLE IF NOT EXISTS holiday_campaign_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES holiday_campaigns(id),
  monday_item_id TEXT,
  phone TEXT NOT NULL,
  lead_name TEXT,
  status TEXT NOT NULL,
  sent_at TEXT,
  error_message TEXT,
  UNIQUE(campaign_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_lookup ON processed_webhooks(source, external_id);
CREATE INDEX IF NOT EXISTS idx_known_senders_lookup ON known_senders(platform, sender_id);
CREATE INDEX IF NOT EXISTS idx_followup_log_lookup ON followup_log(monday_item_id, last_call_date);
CREATE INDEX IF NOT EXISTS idx_holiday_campaigns_form_token ON holiday_campaigns(form_token);
CREATE INDEX IF NOT EXISTS idx_holiday_campaigns_send_date ON holiday_campaigns(send_date);
`;

export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(dirname(env.DB_FILE_PATH), { recursive: true });
  db = new Database(env.DB_FILE_PATH);
  db.exec(SCHEMA);
  logger.info({ path: env.DB_FILE_PATH }, "SQLite DB opened and schema applied");
  return db;
}
