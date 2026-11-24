import type { Queryable } from "../../config/pg.js";

/**
 * @-mentions: staff tagged in a lead's note, and each person's list of the notes they were tagged in, seen or not.
 * Only open staff accounts can be tagged: unknown ids, demo accounts and removed people are left out without an error.
 */

/** How many mentions the list shows, newest note first. The unread count covers them all. */
export const MENTIONS_SHOWN = 30;

export interface MentionDto {
  noteId: string;
  leadId: string;
  leadName: string;
  byUserId: string | null;
  /** When the note was written. */
  at: string;
  text: string;
  seen: boolean;
}

export interface MentionsDto {
  /** Every unseen mention on a lead still in the CRM, not just the ones listed. */
  unread: number;
  items: MentionDto[];
}

/** The ids that can be tagged, each once, in the order given: open staff accounts, never a demo one. */
async function taggable(db: Queryable, ids: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(ids.map((id) => id.toLowerCase()))];
  if (wanted.length === 0) return [];
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM staff_users WHERE id = ANY($1::uuid[]) AND NOT is_demo AND disabled_at IS NULL",
    [wanted],
  );
  const open = new Set(rows.map((row) => row.id));
  return wanted.filter((id) => open.has(id));
}

/**
 * Makes these people the note's tagged set, inside the caller's transaction, and returns the ids stored, in the order
 * given. Someone no longer listed loses the tag; someone newly tagged hasn't seen it yet, except `byUserId` (the person
 * writing), so nobody is told about their own note; someone already tagged keeps what they've seen.
 */
export async function setNoteMentions(tx: Queryable, noteId: string, ids: readonly string[], byUserId: string, now: Date): Promise<string[]> {
  const tagged = await taggable(tx, ids);
  await tx.query("DELETE FROM lead_note_mentions WHERE note_id = $1 AND user_id <> ALL($2::uuid[])", [noteId, tagged]);
  if (tagged.length > 0) {
    await tx.query(
      `INSERT INTO lead_note_mentions (note_id, user_id, created_at, seen_at)
       SELECT $1::uuid, t.user_id, $3::timestamptz, CASE WHEN t.user_id = $4::uuid THEN $3::timestamptz END
       FROM unnest($2::uuid[]) AS t (user_id)
       ON CONFLICT (note_id, user_id) DO NOTHING`,
      [noteId, tagged, now, byUserId],
    );
  }
  return tagged;
}

/** Each note's tagged people, oldest tag first. Notes without any are left out. */
export async function mentionsByNote(db: Queryable, noteIds: readonly string[]): Promise<Map<string, string[]>> {
  const byNote = new Map<string, string[]>();
  if (noteIds.length === 0) return byNote;
  const { rows } = await db.query<{ note_id: string; user_id: string }>(
    "SELECT note_id, user_id FROM lead_note_mentions WHERE note_id = ANY($1::uuid[]) ORDER BY created_at, user_id",
    [noteIds],
  );
  for (const row of rows) {
    const ids = byNote.get(row.note_id);
    if (ids) ids.push(row.user_id);
    else byNote.set(row.note_id, [row.user_id]);
  }
  return byNote;
}

/** Someone's mentions ($1) on leads still in the CRM, archived ones too. */
const MINE = `FROM lead_note_mentions m JOIN lead_notes n ON n.id = m.note_id JOIN leads l ON l.id = n.lead_id
  WHERE m.user_id = $1 AND l.removed_at IS NULL`;

async function unreadMentions(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n ${MINE} AND m.seen_at IS NULL`, [userId]);
  return rows[0].n;
}

interface MentionRow {
  note_id: string;
  lead_id: string;
  lead_name: string;
  by_user_id: string | null;
  at: Date;
  text: string;
  seen: boolean;
}

/** The notes you were tagged in, newest first, and how many of your mentions you haven't seen. */
export async function listMentions(db: Queryable, userId: string): Promise<MentionsDto> {
  const { rows } = await db.query<MentionRow>(
    `SELECT n.id AS note_id, n.lead_id, l.name AS lead_name, n.by_user_id, n.at, n.text, m.seen_at IS NOT NULL AS seen
     ${MINE} ORDER BY n.at DESC, n.id DESC LIMIT ${MENTIONS_SHOWN}`,
    [userId],
  );
  return {
    unread: await unreadMentions(db, userId),
    items: rows.map((row) => ({
      noteId: row.note_id,
      leadId: row.lead_id,
      leadName: row.lead_name,
      byUserId: row.by_user_id,
      at: row.at.toISOString(),
      text: row.text,
      seen: row.seen,
    })),
  };
}

/** Marks your mentions on these notes as seen, or all of yours without a list. One seen before keeps its time. */
export async function markMentionsSeen(db: Queryable, userId: string, noteIds: readonly string[] | undefined, now: Date): Promise<{ unread: number }> {
  await db.query(
    "UPDATE lead_note_mentions SET seen_at = $2 WHERE user_id = $1 AND seen_at IS NULL AND ($3::uuid[] IS NULL OR note_id = ANY($3::uuid[]))",
    [userId, now, noteIds ?? null],
  );
  return { unread: await unreadMentions(db, userId) };
}
