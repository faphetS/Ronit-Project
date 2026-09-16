import { getDb } from "../config/db.js";
import type { Trip } from "./trip.js";

/**
 * Per-sender "we asked which service and are awaiting her answer" state.
 * A row's presence = pending; it is deleted once the flow resolves (she names a
 * service, or — for uman — also names a trip) or the mapping goes stale.
 *
 * `stage` tracks WHICH question is outstanding: 'service' (challah or uman?)
 * or 'trip' (kislev or hanukkah?, uman-only, asked after the service is known).
 * `trip` is set once she has answered the trip question; null until then.
 */
export interface PendingClarification {
  monday_item_id: string;
  phone: string | null;
  reask_count: number;
  stage: "service" | "trip";
  trip: Trip | null;
}

export function getPendingClarification(
  platform: string,
  senderId: string,
): PendingClarification | null {
  const row = getDb()
    .prepare(
      "SELECT monday_item_id, phone, reask_count, stage, trip FROM pending_clarifications WHERE platform = ? AND sender_id = ?",
    )
    .get(platform, senderId) as PendingClarification | undefined;
  return row ?? null;
}

export function upsertPendingClarification(input: {
  platform: string;
  senderId: string;
  mondayItemId: string;
  phone?: string | null;
  stage?: "service" | "trip";
  trip?: Trip | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO pending_clarifications (platform, sender_id, monday_item_id, phone, stage, trip, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(platform, sender_id) DO UPDATE SET
         monday_item_id = excluded.monday_item_id,
         phone = excluded.phone,
         stage = excluded.stage,
         trip = excluded.trip,
         updated_at = datetime('now')`,
    )
    .run(
      input.platform,
      input.senderId,
      input.mondayItemId,
      input.phone ?? null,
      input.stage ?? "service",
      input.trip ?? null,
    );
}

/** Bump the re-ask counter and return the new value. */
export function incrementReaskCount(platform: string, senderId: string): number {
  const row = getDb()
    .prepare(
      `UPDATE pending_clarifications SET reask_count = reask_count + 1, updated_at = datetime('now')
       WHERE platform = ? AND sender_id = ?
       RETURNING reask_count`,
    )
    .get(platform, senderId) as { reask_count: number } | undefined;
  return row?.reask_count ?? 0;
}

/**
 * Advance an existing pending clarification from the service question to the
 * trip question (uman only): sets stage='trip' and resets reask_count to 0, so
 * she gets a fresh set of trip re-asks independent of any service re-asks she
 * may already have used.
 */
export function advanceToTripStage(platform: string, senderId: string): void {
  getDb()
    .prepare(
      `UPDATE pending_clarifications
       SET stage = 'trip', reask_count = 0, updated_at = datetime('now')
       WHERE platform = ? AND sender_id = ?`,
    )
    .run(platform, senderId);
}

export function clearPendingClarification(platform: string, senderId: string): void {
  getDb()
    .prepare(
      "DELETE FROM pending_clarifications WHERE platform = ? AND sender_id = ?",
    )
    .run(platform, senderId);
}

export function deletePendingByItemId(mondayItemId: string): void {
  getDb()
    .prepare("DELETE FROM pending_clarifications WHERE monday_item_id = ?")
    .run(mondayItemId);
}
