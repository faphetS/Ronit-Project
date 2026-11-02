import { logger } from "../../config/logger.js";
import type { Db, Queryable } from "../../config/pg.js";
import { AppError } from "../../lib/errors.js";
import { addDays, israelDay, israelMoment } from "../../lib/israel-time.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import { classifyBoard, toLeads, toTrips, type BoardKind, type BoardSnapshot, type CrmBoardIds, type MondayNote } from "./monday-copy.mapping.js";
import { mondayReader, type Gql, type MondayReader } from "./monday-copy.reader.js";
import {
  copyTotals,
  removeBoard,
  saveBoard,
  saveLeads,
  saveNotes,
  saveTrips,
  storedBoards,
  tidyCustomers,
  type CopyTotals,
} from "./monday-copy.repository.js";

/**
 * The read-only copy of Ronit's Monday boards into the CRM database (spec: 2026-11-02 dashboard
 * data, section 3). Everything is read first, then written in one transaction; a copy that
 * fails or hits Monday's rate limit changes nothing and is recorded as such.
 */

export type CopyTrigger = "schedule" | "startup" | "manual";
export type CopyStatus = "running" | "completed" | "failed" | "skipped";

export interface CopyDeps {
  db: Db;
  gql: Gql;
  boards: CrmBoardIds;
  now: () => Date;
  /** A safety net per copy. Default 150; a copy normally takes about 9 calls. */
  maxCalls?: number;
}

/** Every 2 hours from 07:00 to 23:00, Israel time. */
export const COPY_HOURS = [7, 9, 11, 13, 15, 17, 19, 21, 23];
export const COPY_SCHEDULE = "0 7-23/2 * * *";
/** The old CRM board barely changes: it's read at most this often. */
const ARCHIVE_EVERY_MS = 20 * 60 * 60_000;
/** Notes: the whole history on the first copy, then usually one call. */
const NOTE_CALLS_PER_BOARD = 50;
const MAX_CALLS = 150;
/** A run left "running" by a restart counts as failed after this long. */
const STALE_RUN_MS = 30 * 60_000;
/** "Sync now" waits this long after the last copy started. */
export const MANUAL_GAP_MS = 5 * 60_000;
/** At startup, copy right away when the last copy is older than this. */
const STARTUP_STALE_MS = 2 * 60 * 60_000;

export interface CopyRun {
  id: string;
  trigger: CopyTrigger;
  byUserId: string | null;
  status: CopyStatus;
  startedAt: string;
  finishedAt: string | null;
  boardsRead: number;
  apiCalls: number;
  totals: CopyTotals | null;
  error: string | null;
}

interface RunRow {
  id: string;
  trigger: CopyTrigger;
  by_user_id: string | null;
  status: CopyStatus;
  started_at: Date;
  finished_at: Date | null;
  boards_read: number;
  api_calls: number;
  totals: CopyTotals | Record<string, never>;
  error: string | null;
}

const RUN_COLUMNS = "id, trigger, by_user_id, status, started_at, finished_at, boards_read, api_calls, totals, error";

function toRun(row: RunRow): CopyRun {
  return {
    id: row.id,
    trigger: row.trigger,
    byUserId: row.by_user_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    boardsRead: row.boards_read,
    apiCalls: row.api_calls,
    totals: "leads" in row.totals ? (row.totals as CopyTotals) : null,
    error: row.error,
  };
}

export async function latestRun(db: Queryable): Promise<CopyRun | null> {
  const { rows } = await db.query<RunRow>(`SELECT ${RUN_COLUMNS} FROM monday_copy_runs ORDER BY started_at DESC LIMIT 1`);
  return rows[0] ? toRun(rows[0]) : null;
}

/** The latest run that finished the copy. */
export async function lastCompletedRun(db: Queryable): Promise<CopyRun | null> {
  const { rows } = await db.query<RunRow>(`SELECT ${RUN_COLUMNS} FROM monday_copy_runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1`);
  return rows[0] ? toRun(rows[0]) : null;
}

/** When the schedule copies next. */
export function nextScheduledCopy(now: Date): Date {
  const today = israelDay(now);
  for (const hour of COPY_HOURS) {
    const at = israelMoment(today, `${String(hour).padStart(2, "0")}:00`);
    if (at > now) return at;
  }
  return israelMoment(addDays(today, 1), `${String(COPY_HOURS[0]).padStart(2, "0")}:00`);
}

let running = false;

/** Whether a copy is running in this process. */
export function copyRunning(): boolean {
  return running;
}

interface NotesRead {
  notes: MondayNote[];
  complete: boolean;
}

/** Reads every board the copy needs, then writes the copy. Returns how many boards were read. */
async function copyBoards(deps: CopyDeps, reader: MondayReader): Promise<number> {
  const { db } = deps;
  const at = deps.now();
  const listed = await reader.listBoards();
  const known = await storedBoards(db);
  const boards = listed.flatMap((info) => {
    const kind = classifyBoard(info, deps.boards);
    return kind ? [{ info, kind }] : [];
  });
  const due = (id: string, kind: BoardKind) => {
    if (kind !== "crm-archive") return true;
    const stored = known.get(id);
    return !stored?.copiedAt || stored.removedAt !== null || at.getTime() - stored.copiedAt.getTime() >= ARCHIVE_EVERY_MS;
  };
  const toRead = boards.filter(({ info, kind }) => due(info.id, kind));

  const structure = await reader.readStructure(toRead.map(({ info }) => info.id));
  const snapshots: BoardSnapshot[] = [];
  for (const { info, kind } of toRead) {
    const shape = structure.get(info.id);
    if (!shape) continue;
    snapshots.push({ board: { ...info, kind }, columns: shape.columns, groups: shape.groups, rows: await reader.readRows(info.id) });
  }
  const notes = new Map<string, NotesRead>();
  for (const snapshot of snapshots) {
    if (snapshot.board.kind !== "crm" && snapshot.board.kind !== "crm-archive") continue;
    const read = await reader.readNotes(snapshot.board.id, known.get(snapshot.board.id)?.notesThrough ?? null, NOTE_CALLS_PER_BOARD);
    if (!read.complete) logger.warn({ boardId: snapshot.board.id }, "Monday copy: more notes than one copy reads; the oldest wait");
    notes.set(snapshot.board.id, read);
  }

  await db.transaction(async (tx) => {
    const listedIds = new Set(boards.map(({ info }) => info.id));
    for (const stored of known.values()) {
      if (!listedIds.has(stored.id) && stored.removedAt === null) await removeBoard(tx, stored.id, at);
    }
    for (const { info, kind } of boards) {
      const snapshot = snapshots.find((s) => s.board.id === info.id);
      const read = notes.get(info.id);
      const newest = read?.complete && read.notes.length > 0 ? new Date(Math.max(...read.notes.map((note) => Date.parse(note.at)))) : null;
      await saveBoard(tx, { info, kind, read: snapshot ? { rows: snapshot.rows.length, groups: snapshot.groups.length } : null, notesThrough: newest }, at);
    }
    for (const snapshot of snapshots) {
      if (snapshot.board.kind === "crm" || snapshot.board.kind === "crm-archive") {
        await saveLeads(tx, snapshot.board.id, toLeads(snapshot).leads, at);
      } else {
        const { trips, members } = toTrips(snapshot);
        await saveTrips(tx, snapshot.board.id, trips, members, at);
      }
      const read = notes.get(snapshot.board.id);
      if (read) await saveNotes(tx, snapshot.board.id, read.notes);
    }
    await tidyCustomers(tx);
  });
  return snapshots.length;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
}

/** Records a new run and marks this process busy. Refuses (409) while another copy is running here. */
async function beginRun(deps: CopyDeps, trigger: CopyTrigger, byUserId: string | null): Promise<string> {
  if (running) throw new AppError(409, "A copy from Monday is already running", "COPY_RUNNING");
  running = true;
  try {
    const started = deps.now();
    await deps.db.query(
      "UPDATE monday_copy_runs SET status = 'failed', finished_at = $1, error = 'interrupted' WHERE status = 'running' AND started_at < $2",
      [started, new Date(started.getTime() - STALE_RUN_MS)],
    );
    const { rows } = await deps.db.query<{ id: string }>(
      "INSERT INTO monday_copy_runs (trigger, by_user_id, started_at) VALUES ($1, $2, $3) RETURNING id",
      [trigger, byUserId, started],
    );
    return rows[0].id;
  } catch (err) {
    running = false;
    throw err;
  }
}

/** Reads and writes the copy for a begun run, and records how it went. Never throws for Monday or mapping failures. */
async function performRun(deps: CopyDeps, runId: string, trigger: CopyTrigger): Promise<CopyRun> {
  try {
    const reader = mondayReader(deps.gql, deps.maxCalls ?? MAX_CALLS);
    let status: CopyStatus = "completed";
    let boardsRead = 0;
    let totals: CopyTotals | null = null;
    let error: string | null = null;
    try {
      boardsRead = await copyBoards(deps, reader);
      totals = await copyTotals(deps.db);
      logger.info({ runId, trigger, boardsRead, calls: reader.calls(), totals }, "Monday copy done");
    } catch (err) {
      status = err instanceof MondayRateLimitError ? "skipped" : "failed";
      error = errorText(err);
      if (status === "skipped") logger.warn({ err, runId, trigger }, "Monday copy skipped: Monday is limiting calls");
      else logger.error({ err, runId, trigger }, "Monday copy failed");
    }
    const finished = await deps.db.query<RunRow>(
      `UPDATE monday_copy_runs SET status = $2, finished_at = $3, boards_read = $4, api_calls = $5, totals = $6, error = $7
       WHERE id = $1 RETURNING ${RUN_COLUMNS}`,
      [runId, status, deps.now(), boardsRead, reader.calls(), JSON.stringify(totals ?? {}), error],
    );
    return toRun(finished.rows[0]);
  } finally {
    running = false;
  }
}

/** One copy, start to finish; a failure is recorded on the run. Refuses (409) while another copy is running. */
export async function copyFromMonday(deps: CopyDeps, trigger: CopyTrigger, byUserId: string | null = null): Promise<CopyRun> {
  const runId = await beginRun(deps, trigger, byUserId);
  return performRun(deps, runId, trigger);
}

/**
 * "Sync now" from the dashboard: records the run, answers with it while it's still running, and
 * copies in the background; the page follows it with GET /imports/latest. Refused while one is
 * running (409), or within MANUAL_GAP_MS of the last one starting (429).
 */
export async function startManualCopy(deps: CopyDeps, byUserId: string): Promise<CopyRun> {
  if (running) throw new AppError(409, "A copy from Monday is already running", "COPY_RUNNING");
  const last = await latestRun(deps.db);
  if (last && deps.now().getTime() - Date.parse(last.startedAt) < MANUAL_GAP_MS) {
    throw new AppError(429, "Monday was copied a moment ago — try again in a few minutes", "COPY_TOO_SOON");
  }
  const runId = await beginRun(deps, "manual", byUserId);
  await deps.db.query("INSERT INTO audit_log (by_user_id, action, at, details) VALUES ($1, 'monday-copy', $2, $3)", [
    byUserId,
    deps.now(),
    JSON.stringify({ runId }),
  ]);
  const { rows } = await deps.db.query<RunRow>(`SELECT ${RUN_COLUMNS} FROM monday_copy_runs WHERE id = $1`, [runId]);
  void performRun(deps, runId, "manual").catch((err: unknown) => logger.error({ err, runId }, "Manual Monday copy crashed"));
  return toRun(rows[0]);
}

/**
 * At startup: runs this process didn't finish are marked interrupted, then it copies right away
 * when the last finished copy is older than 2 hours (or there's none).
 */
export async function copyIfStale(deps: CopyDeps): Promise<void> {
  await deps.db.query("UPDATE monday_copy_runs SET status = 'failed', finished_at = $1, error = 'interrupted' WHERE status = 'running'", [deps.now()]);
  const last = await lastCompletedRun(deps.db);
  if (last && deps.now().getTime() - Date.parse(last.startedAt) < STARTUP_STALE_MS) return;
  await copyFromMonday(deps, "startup");
}
