import type { Db, Queryable } from "../../config/pg.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Role } from "../auth/auth.service.js";
import { mentionsByNote, setNoteMentions } from "./mentions.service.js";

/** A lead's own notes, kept in the CRM only (Monday's notes are read-only). Spec: 2026-11-24-lead-notes-and-crm-groups-design.md */

export interface LeadNoteDto {
  id: string;
  at: string;
  text: string;
  byUserId: string | null;
  editedAt: string | null;
  /** The staff tagged in it (@-mentions). */
  mentions: string[];
}

interface NoteRow {
  id: string;
  at: Date;
  text: string;
  by_user_id: string | null;
  edited_at: Date | null;
}

const toNote = (row: NoteRow, mentions: string[]): LeadNoteDto => ({
  id: row.id,
  at: row.at.toISOString(),
  text: row.text,
  byUserId: row.by_user_id,
  editedAt: row.edited_at ? row.edited_at.toISOString() : null,
  mentions,
});

type Editor = { id: string; role: Role };

/** Saves the note and tags the people in `mentions`, in one transaction. */
export async function addLeadNote(
  db: Db,
  leadId: string,
  byUserId: string,
  text: string,
  now: Date,
  mentions: readonly string[] = [],
): Promise<LeadNoteDto> {
  return db.transaction(async (tx) => {
    const lead = await tx.query("SELECT 1 FROM leads WHERE id = $1 AND removed_at IS NULL", [leadId]);
    if (!lead.rows[0]) throw new NotFoundError("Lead");
    const { rows } = await tx.query<NoteRow>(
      "INSERT INTO lead_notes (lead_id, by_user_id, at, text) VALUES ($1, $2, $3, $4) RETURNING id, at, text, by_user_id, edited_at",
      [leadId, byUserId, now, text.trim()],
    );
    return toNote(rows[0], await setNoteMentions(tx, rows[0].id, mentions, byUserId, now));
  });
}

/** Checks the note is on that lead and that this editor may change it. Inside a transaction, holds the note until it ends. */
async function checkOwn(db: Queryable, editor: Editor, leadId: string, noteId: string): Promise<void> {
  const { rows } = await db.query<{ by_user_id: string | null }>(
    "SELECT n.by_user_id FROM lead_notes n JOIN leads l ON l.id = n.lead_id WHERE n.id = $1 AND n.lead_id = $2 AND l.removed_at IS NULL FOR UPDATE OF n",
    [noteId, leadId],
  );
  if (!rows[0]) throw new NotFoundError("Note");
  if (rows[0].by_user_id !== editor.id && editor.role !== "admin") {
    throw new AppError(403, "Only the note's author or an admin can change it", "NOT_YOUR_NOTE");
  }
}

/** A new text. `mentions`, when given, becomes the note's whole tagged set; left out, the tags stay as they are. */
export async function editLeadNote(
  db: Db,
  editor: Editor,
  leadId: string,
  noteId: string,
  text: string,
  now: Date,
  mentions?: readonly string[],
): Promise<LeadNoteDto> {
  return db.transaction(async (tx) => {
    await checkOwn(tx, editor, leadId, noteId);
    const { rows } = await tx.query<NoteRow>(
      "UPDATE lead_notes SET text = $3, edited_at = $4 WHERE id = $1 AND lead_id = $2 RETURNING id, at, text, by_user_id, edited_at",
      [noteId, leadId, text.trim(), now],
    );
    if (!rows[0]) throw new NotFoundError("Note");
    const tagged =
      mentions === undefined ? ((await mentionsByNote(tx, [noteId])).get(noteId) ?? []) : await setNoteMentions(tx, noteId, mentions, editor.id, now);
    return toNote(rows[0], tagged);
  });
}

/** Its tags go with it. */
export async function deleteLeadNote(db: Queryable, editor: Editor, leadId: string, noteId: string): Promise<void> {
  await checkOwn(db, editor, leadId, noteId);
  await db.query("DELETE FROM lead_notes WHERE id = $1 AND lead_id = $2", [noteId, leadId]);
}
