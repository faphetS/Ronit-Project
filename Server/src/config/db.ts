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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pending_clarifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  monday_item_id TEXT NOT NULL,
  phone TEXT,
  reask_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, sender_id)
);

CREATE TABLE IF NOT EXISTS pending_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  call_time TEXT NOT NULL,
  summary TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wa_followup_state (
  monday_item_id      TEXT PRIMARY KEY,
  phone               TEXT,
  group_first_seen_at TEXT,
  replied_at          TEXT,
  sent_3d_at          TEXT,
  sent_10d_at         TEXT,
  sent_flight_at      TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_lookup ON processed_webhooks(source, external_id);
CREATE INDEX IF NOT EXISTS idx_pending_clar_lookup ON pending_clarifications(platform, sender_id);
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
  const pendingCols = db.prepare("PRAGMA table_info(pending_recordings)").all() as Array<{ name: string }>;
  if (!pendingCols.some((c) => c.name === "summary")) {
    db.exec("ALTER TABLE pending_recordings ADD COLUMN summary TEXT");
  }
  logger.info({ path: env.DB_FILE_PATH }, "SQLite DB opened and schema applied");
  return db;
}

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare<[string], { value: string }>("SELECT value FROM settings WHERE key = ?")
    .get(key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value);
}

export interface PendingRecording {
  id: number;
  call_id: string;
  item_id: string;
  call_time: string;
  summary: string | null;
  attempt_count: number;
  created_at: string;
}

const PENDING_COLS = "id, call_id, item_id, call_time, summary, attempt_count, created_at";

export function enqueuePendingRecording(callId: string, itemId: string, callTime: string): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO pending_recordings (call_id, item_id, call_time) VALUES (?, ?, ?)",
    )
    .run(callId, itemId, callTime);
}

// Fast checker: rows from the last 3h (the normal case — recording ready in seconds).
export function getRecentPendingRecordings(limit: number): PendingRecording[] {
  return getDb()
    .prepare(
      `SELECT ${PENDING_COLS} FROM pending_recordings
       WHERE created_at >= datetime('now','-3 hours')
       ORDER BY created_at ASC LIMIT ?`,
    )
    .all(limit) as PendingRecording[];
}

// Catch-up sweep: rows 3h–7d old (phone was offline; recording uploaded late).
export function getCatchupPendingRecordings(limit: number): PendingRecording[] {
  return getDb()
    .prepare(
      `SELECT ${PENDING_COLS} FROM pending_recordings
       WHERE created_at < datetime('now','-3 hours')
         AND created_at >= datetime('now','-7 days')
       ORDER BY created_at ASC LIMIT ?`,
    )
    .all(limit) as PendingRecording[];
}

export function getPendingRecordingByCallId(callId: string): PendingRecording | null {
  const row = getDb()
    .prepare(`SELECT ${PENDING_COLS} FROM pending_recordings WHERE call_id = ?`)
    .get(callId) as PendingRecording | undefined;
  return row ?? null;
}

export function deletePendingRecording(id: number): void {
  getDb().prepare("DELETE FROM pending_recordings WHERE id = ?").run(id);
}

export function bumpPendingRecording(id: number, error: string): void {
  getDb()
    .prepare(
      `UPDATE pending_recordings
       SET attempt_count = attempt_count + 1, last_error = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(error, id);
}

export function saveRecordingSummary(id: number, summary: string): void {
  getDb()
    .prepare(
      `UPDATE pending_recordings
       SET summary = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(summary, id);
}

// Final give-up: rows older than 7 days. Returns the call_ids it removed so the
// caller can log each permanently-missed recording.
export function expireOldPendingRecordings(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT call_id FROM pending_recordings WHERE created_at < datetime('now','-7 days')")
    .all() as Array<{ call_id: string }>;
  if (rows.length > 0) {
    db.prepare("DELETE FROM pending_recordings WHERE created_at < datetime('now','-7 days')").run();
  }
  return rows.map((r) => r.call_id);
}

// ---------------------------------------------------------------------------
// WhatsApp Uman follow-up state — per-lead inactivity clock + per-stage send
// flags. Timestamps are SQLite UTC strings ("YYYY-MM-DD HH:MM:SS"); the cron
// parses them as UTC. The inactivity anchor is max(group_first_seen, last_wa_inbound).
// ---------------------------------------------------------------------------

export interface WaFollowupState {
  monday_item_id: string;
  phone: string | null;
  group_first_seen_at: string | null;
  replied_at: string | null;
  sent_3d_at: string | null;
  sent_10d_at: string | null;
  sent_flight_at: string | null;
}

const WA_FOLLOWUP_COLS =
  "monday_item_id, phone, group_first_seen_at, replied_at, sent_3d_at, sent_10d_at, sent_flight_at";

export function getWaFollowupState(itemId: string): WaFollowupState | null {
  const row = getDb()
    .prepare(`SELECT ${WA_FOLLOWUP_COLS} FROM wa_followup_state WHERE monday_item_id = ?`)
    .get(itemId) as WaFollowupState | undefined;
  return row ?? null;
}

// Cron observation: ensure a row exists and stamp group_first_seen_at the FIRST
// time we see this lead in the follow-up group. The inactivity clock counts from
// here for leads who never reply. Idempotent — never overwrites the stamp.
export function markSeenInFollowupGroup(itemId: string, phone: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO wa_followup_state (monday_item_id, phone, group_first_seen_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(monday_item_id) DO UPDATE SET
         phone = excluded.phone,
         group_first_seen_at = COALESCE(wa_followup_state.group_first_seen_at, datetime('now')),
         updated_at = datetime('now')`,
    )
    .run(itemId, phone);
}

// Drag-in / re-entry: a lead (re)added to the follow-up group starts a FRESH
// follow-up cycle — the clock restarts now and all halt/sent flags clear, so the
// 3d → 10d → flight sequence runs again until she replies. Called for leads seen in
// the group this run that were absent on the previous run (and first-time entries).
export function resetFollowupState(itemId: string, phone: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO wa_followup_state
         (monday_item_id, phone, group_first_seen_at, replied_at, sent_3d_at, sent_10d_at, sent_flight_at)
       VALUES (?, ?, datetime('now'), NULL, NULL, NULL, NULL)
       ON CONFLICT(monday_item_id) DO UPDATE SET
         phone = excluded.phone,
         group_first_seen_at = datetime('now'),
         replied_at = NULL,
         sent_3d_at = NULL,
         sent_10d_at = NULL,
         sent_flight_at = NULL,
         updated_at = datetime('now')`,
    )
    .run(itemId, phone);
}

// A lead's inbound reply: they are engaged now, so the follow-up funnel HALTS —
// no further 3d/10d/flight messages fire (the cron skips any lead with replied_at
// set). Records the first-reply time; never touches the send flags.
export function markLeadReplied(itemId: string, phone: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO wa_followup_state (monday_item_id, phone, replied_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(monday_item_id) DO UPDATE SET
         phone = COALESCE(excluded.phone, wa_followup_state.phone),
         replied_at = COALESCE(wa_followup_state.replied_at, datetime('now')),
         updated_at = datetime('now')`,
    )
    .run(itemId, phone);
}

export function markFollowupStageSent(itemId: string, stage: "3d" | "10d" | "flight"): void {
  const col =
    stage === "3d" ? "sent_3d_at" : stage === "10d" ? "sent_10d_at" : "sent_flight_at";
  // Upsert (not a bare UPDATE): a successful send must ALWAYS be recorded, even in
  // the unlikely case the state row is missing — otherwise the next run re-sends.
  getDb()
    .prepare(
      `INSERT INTO wa_followup_state (monday_item_id, ${col}) VALUES (?, datetime('now'))
       ON CONFLICT(monday_item_id) DO UPDATE SET ${col} = datetime('now'), updated_at = datetime('now')`,
    )
    .run(itemId);
}
