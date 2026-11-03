import type { Queryable } from "../../config/pg.js";
import type { TemplateMessage } from "./outbox.sender.js";

/** A message the sender has claimed and must now send. */
export interface ClaimedMessage {
  id: string;
  kind: "holiday" | "birthday";
  to_phone: string;
  /** The text as it reads, filled for this recipient. */
  body: string;
  /** The approved template it goes out as, on WhatsApp's own API. */
  template: TemplateMessage | null;
}

/**
 * Claims up to `limit` messages that are due, oldest first, by marking them 'sending'.
 * SKIP LOCKED means two overlapping runs never claim the same message.
 */
export async function claimDueMessages(db: Queryable, now: Date, limit: number): Promise<ClaimedMessage[]> {
  const { rows } = await db.query<
    Omit<ClaimedMessage, "template"> & { send_at: Date; template_name: string | null; template_language: string | null; template_params: string[] | null }
  >(
    `UPDATE messages
     SET status = 'sending', claimed_at = $1, attempts = attempts + 1, updated_at = now()
     WHERE id IN (
       SELECT id FROM messages
       WHERE status = 'queued' AND send_at <= $1
       ORDER BY send_at, id
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, kind, to_phone, body, send_at, template_name, template_language, template_params`,
    [now, limit],
  );
  return rows
    .sort((a, b) => new Date(a.send_at).getTime() - new Date(b.send_at).getTime())
    .map(({ id, kind, to_phone, body, template_name, template_language, template_params }) => ({
      id,
      kind,
      to_phone,
      body,
      template: template_name && template_language ? { name: template_name, language: template_language, params: template_params ?? [] } : null,
    }));
}

export async function markSent(db: Queryable, id: string, providerMessageId: string | null, at: Date): Promise<void> {
  await db.query(
    `UPDATE messages SET status = 'sent', provider_message_id = $2, sent_at = $3, failure = NULL, updated_at = now()
     WHERE id = $1`,
    [id, providerMessageId, at],
  );
}

export async function markFailed(db: Queryable, id: string, failure: string): Promise<void> {
  await db.query(`UPDATE messages SET status = 'failed', failure = $2, updated_at = now() WHERE id = $1`, [
    id,
    failure.slice(0, 200),
  ]);
}

/** Not sent on purpose: the number isn't on the allowlist, birthdays are off, or a dry run. */
export async function markSkipped(db: Queryable, id: string, reason: string): Promise<void> {
  await db.query(`UPDATE messages SET status = 'skipped', failure = $2, updated_at = now() WHERE id = $1`, [id, reason]);
}

/**
 * Messages still 'sending' long after they were claimed belong to a run that died mid-send.
 * They are marked failed, never resent: the send may have gone out, and a missed greeting
 * can be resent by hand where a double one can't be undone.
 */
export async function failInterruptedSends(db: Queryable, now: Date, staleMinutes = 15): Promise<number> {
  const cutoff = new Date(now.getTime() - staleMinutes * 60_000);
  const { rows } = await db.query(
    `UPDATE messages SET status = 'failed', failure = 'interrupted', updated_at = now()
     WHERE status = 'sending' AND claimed_at < $1
     RETURNING id`,
    [cutoff],
  );
  return rows.length;
}
