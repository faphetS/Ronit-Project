import type { Db } from "../../config/pg.js";
import { NotFoundError } from "../../lib/errors.js";
import type { LeadStatus } from "../monday-copy/monday-copy.mapping.js";
import { labelFor, type SettableStatus } from "./lead-status-mirror.js";

/**
 * A lead's status, changed in the CRM. It's saved here first and stands even if Monday is down. For leads on the live
 * CRM board, the "נוצר קשר" label waits for the mirror to take it to Monday.
 * Spec: docs/superpowers/specs/2026-11-24-lead-status-crm-first-design.md
 */

export interface StatusChange {
  leadId: string;
  status: SettableStatus;
  byUserId: string;
}

/** Saves the change and logs who made it. "unchanged" when the lead already has that status: nothing is written. */
export async function setLeadStatus(db: Db, crmBoardId: string, change: StatusChange, now: Date): Promise<"changed" | "unchanged"> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: LeadStatus; monday_board_id: string }>(
      "SELECT status, monday_board_id FROM leads WHERE id = $1 AND removed_at IS NULL FOR UPDATE",
      [change.leadId],
    );
    const lead = rows[0];
    if (!lead) throw new NotFoundError("Lead");
    if (lead.status === change.status) return "unchanged";
    const waitingLabel = lead.monday_board_id === crmBoardId ? labelFor(change.status) : null;
    await tx.query(
      `UPDATE leads SET status = $2, status_changed_at = $3, status_changed_by = $4, monday_label_pending = $5,
         monday_sync_attempts = 0, monday_sync_error = NULL, monday_sync_next_at = NULL
       WHERE id = $1`,
      [change.leadId, change.status, now, change.byUserId, waitingLabel],
    );
    await tx.query("INSERT INTO audit_log (at, by_user_id, action, details) VALUES ($1, $2, 'lead-status-changed', $3::text::jsonb)", [
      now,
      change.byUserId,
      JSON.stringify({ leadId: change.leadId, from: lead.status, to: change.status }),
    ]);
    return "changed";
  });
}
