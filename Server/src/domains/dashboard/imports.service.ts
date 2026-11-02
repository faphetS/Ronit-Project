import type { Queryable } from "../../config/pg.js";
import type { BoardKind } from "../monday-copy/monday-copy.mapping.js";
import { copyTotals, type CopyTotals } from "../monday-copy/monday-copy.repository.js";
import { latestRun, lastCompletedRun, nextScheduledCopy, type CopyRun } from "../monday-copy/monday-copy.service.js";

/** The Import page: how the copy of Monday stands. */

export interface CopiedBoardDto {
  id: string;
  name: string;
  kind: BoardKind;
  items: number;
  groups: number;
  copiedAt: string | null;
}

export interface MondayCopyDto {
  /** Copies on the schedule (MONDAY_COPY_ENABLED). "Sync now" needs it too. */
  enabled: boolean;
  /** The latest run, whatever happened to it. */
  lastRun: CopyRun | null;
  /** When the dashboard's data was last brought up to date. */
  lastCopiedAt: string | null;
  nextRunAt: string | null;
  boards: CopiedBoardDto[];
  totals: CopyTotals;
}

export async function mondayCopyStatus(db: Queryable, enabled: boolean, now: Date): Promise<MondayCopyDto> {
  const { rows } = await db.query<{ id: string; name: string; kind: BoardKind; items: number; groups: number; copied_at: Date | null }>(
    `SELECT id, name, kind, items, groups, copied_at FROM monday_boards WHERE removed_at IS NULL
     ORDER BY CASE kind WHEN 'crm' THEN 0 WHEN 'flight' THEN 1 WHEN 'challah' THEN 2 ELSE 3 END, name`,
  );
  const completed = await lastCompletedRun(db);
  return {
    enabled,
    lastRun: await latestRun(db),
    lastCopiedAt: completed?.finishedAt ?? null,
    nextRunAt: enabled ? nextScheduledCopy(now).toISOString() : null,
    boards: rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, items: row.items, groups: row.groups, copiedAt: row.copied_at?.toISOString() ?? null })),
    totals: await copyTotals(db),
  };
}
