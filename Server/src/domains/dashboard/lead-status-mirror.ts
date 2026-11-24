import { logger } from "../../config/logger.js";
import type { Queryable } from "../../config/pg.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import type { Gql } from "../monday-copy/monday-copy.reader.js";

/**
 * Keeps Monday in step with a status changed in the CRM, through the lead's "נוצר קשר" label: the one the office
 * sets by hand. The CRM's change already stands; this only tells Monday, and keeps trying until Monday takes it.
 * It never moves a lead between Monday groups, and never creates a label.
 * Spec: docs/superpowers/specs/2026-11-24-lead-status-crm-first-design.md
 */

/** The statuses a person can give a lead. "details-sent" stays Monday's own, shown under In progress. */
export const SETTABLE_STATUSES = ["new", "talking", "no-answer", "registered", "not-relevant"] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

const LABELS: Record<SettableStatus, string> = {
  new: "",
  talking: "נוצר קשר",
  "no-answer": "אין מענה",
  registered: "נסגר",
  "not-relevant": "לא רלוונטי",
};

/** Monday's "נוצר קשר" label for a status; empty for New, which clears the label. */
export function labelFor(status: SettableStatus): string {
  return LABELS[status];
}

export interface MirrorDeps {
  db: Queryable;
  gql: Gql;
  /** The live CRM board. Only its leads are kept in step: the old board changes in the CRM only. */
  crmBoardId: string;
  now: () => Date;
}

export type MirrorResult = "done" | "failed" | "rate-limited" | "skipped";

/** After a failure: the next try in 2 minutes for the first 30 tries (about an hour), then hourly. */
export const FAST_ATTEMPTS = 30;
export const RETRY_FAST_MS = 2 * 60_000;
export const RETRY_SLOW_MS = 60 * 60_000;

const CONTACT_COLUMN = "נוצר קשר";

/** The "נוצר קשר" column's id on each board, read once per server run. Found by title, like the copy does. */
const contactColumns = new Map<string, string>();

/** For tests: forget the column ids read from Monday. */
export function forgetMondayColumns(): void {
  contactColumns.clear();
}

async function contactColumn(deps: MirrorDeps, boardId: string): Promise<string> {
  const known = contactColumns.get(boardId);
  if (known) return known;
  const data = await deps.gql<{ boards: Array<{ columns: Array<{ id: string; title: string }> }> }>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { id columns { id title } } }`,
    { ids: [boardId] },
  );
  const column = data.boards[0]?.columns.find((candidate) => candidate.title.trim() === CONTACT_COLUMN);
  if (!column) throw new Error(`Board ${boardId} has no "${CONTACT_COLUMN}" column`);
  contactColumns.set(boardId, column.id);
  return column.id;
}

const SET_LABEL = `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
  change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
}`;

interface WaitingLead {
  monday_item_id: string;
  monday_board_id: string;
  monday_label_pending: string | null;
  monday_sync_attempts: number;
  removed_at: Date | null;
}

/**
 * The call in flight for each lead, so one lead's writes to Monday go one at a time, in the order they were asked.
 * This assumes one server process: with several, this map would not see the others' calls.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Writes a lead's waiting label to Monday, once. On success the lead is in step, unless a newer change arrived
 * meanwhile: that one stays waiting. On failure the try is counted and the next one scheduled.
 * Calls for the same lead wait for each other, so an older label never lands in Monday after a newer one.
 */
export function mirrorStatus(deps: MirrorDeps, leadId: string): Promise<MirrorResult> {
  const previous = inFlight.get(leadId);
  const run = previous ? previous.then(() => writeLabel(deps, leadId), () => writeLabel(deps, leadId)) : writeLabel(deps, leadId);
  inFlight.set(leadId, run);
  const cleanup = () => {
    if (inFlight.get(leadId) === run) inFlight.delete(leadId);
  };
  run.then(cleanup, cleanup);
  return run;
}

async function writeLabel(deps: MirrorDeps, leadId: string): Promise<MirrorResult> {
  const { rows } = await deps.db.query<WaitingLead>(
    "SELECT monday_item_id, monday_board_id, monday_label_pending, monday_sync_attempts, removed_at FROM leads WHERE id = $1",
    [leadId],
  );
  const lead = rows[0];
  if (!lead || lead.monday_label_pending === null) return "skipped";
  const label = lead.monday_label_pending;

  if (lead.removed_at) {
    // The copy found the row gone from Monday (deleted, or closed into a trip): nothing is left to update.
    await deps.db.query(
      "UPDATE leads SET monday_label_pending = NULL, monday_sync_next_at = NULL, monday_sync_error = $3 WHERE id = $1 AND monday_label_pending = $2",
      [leadId, label, "The lead is no longer in Monday"],
    );
    return "skipped";
  }

  if (lead.monday_board_id !== deps.crmBoardId) {
    // Only the live CRM board is kept in step; leads on the old board change in the CRM only.
    await deps.db.query(
      "UPDATE leads SET monday_label_pending = NULL, monday_sync_next_at = NULL, monday_sync_error = $3 WHERE id = $1 AND monday_label_pending = $2",
      [leadId, label, "The lead is not on the live CRM board"],
    );
    return "skipped";
  }

  try {
    const columnId = await contactColumn(deps, lead.monday_board_id);
    await deps.gql(SET_LABEL, {
      boardId: lead.monday_board_id,
      itemId: lead.monday_item_id,
      columnId,
      value: JSON.stringify(label ? { label } : {}),
    });
  } catch (err) {
    const attempts = lead.monday_sync_attempts + 1;
    const wait = attempts <= FAST_ATTEMPTS ? RETRY_FAST_MS : RETRY_SLOW_MS;
    const message = err instanceof Error ? err.message.slice(0, 300) : "Monday didn't take the label";
    await deps.db.query(
      "UPDATE leads SET monday_sync_attempts = $3, monday_sync_error = $4, monday_sync_next_at = $5 WHERE id = $1 AND monday_label_pending = $2",
      [leadId, label, attempts, message, new Date(deps.now().getTime() + wait)],
    );
    logger.warn({ leadId, attempts, err }, "Lead status not in Monday yet");
    return err instanceof MondayRateLimitError ? "rate-limited" : "failed";
  }

  await deps.db.query(
    `UPDATE leads SET monday_label_pending = NULL, contact_status = $3, monday_sync_attempts = 0, monday_sync_error = NULL,
       monday_sync_next_at = NULL, monday_label_sent_at = $4
     WHERE id = $1 AND monday_label_pending = $2`,
    [leadId, label, label || null, deps.now()],
  );
  return "done";
}

/** The retry job's run: up to `limit` waiting leads that are due, oldest first. A rate limit ends the run. */
export async function retryPending(deps: MirrorDeps, limit = 20): Promise<{ done: number; failed: number }> {
  const { rows } = await deps.db.query<{ id: string }>(
    `SELECT id FROM leads
     WHERE monday_label_pending IS NOT NULL AND (monday_sync_next_at IS NULL OR monday_sync_next_at <= $1)
     ORDER BY status_changed_at
     LIMIT $2`,
    [deps.now(), limit],
  );
  const tally = { done: 0, failed: 0 };
  for (const { id } of rows) {
    let result: MirrorResult;
    try {
      result = await mirrorStatus(deps, id);
    } catch (err) {
      logger.error({ err, leadId: id }, "Lead status mirror failed");
      tally.failed += 1;
      continue;
    }
    if (result === "done") tally.done += 1;
    if (result === "failed" || result === "rate-limited") tally.failed += 1;
    if (result === "rate-limited") break;
  }
  return tally;
}

/** Tells Monday right after a change, waiting at most `waitMs`. A slower Monday carries on in the background. Never throws. */
export async function mirrorSoon(deps: MirrorDeps, leadId: string, waitMs = 4000): Promise<void> {
  const attempt = mirrorStatus(deps, leadId).catch((err: unknown) => {
    logger.error({ err, leadId }, "Lead status mirror failed");
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  await Promise.race([attempt, timeout]);
  clearTimeout(timer);
}
