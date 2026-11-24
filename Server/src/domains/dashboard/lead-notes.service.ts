import type { Queryable } from "../../config/pg.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Role } from "../auth/auth.service.js";

/** A lead's own notes, kept in the CRM only (Monday's notes are read-only). Spec: 2026-11-24-lead-notes-and-crm-groups-design.md */

export interface LeadNoteDto {
  id: string;
  at: string;
  text: string;
  byUserId: string | null;
  editedAt: string | null;
}

interface NoteRow {
  id: string;
  at: Date;
  text: string;
  by_user_id: string | null;
  edited_at: Date | null;
}

const toNote = (row: NoteRow): LeadNoteDto => ({
  id: row.id,
  at: row.at.toISOString(),
  text: row.text,
  byUserId: row.by_user_id,
  editedAt: row.edited_at ? row.edited_at.toISOString() : null,
});

type Editor = { id: string; role: Role };

export async function addLeadNote(db: Queryable, leadId: string, byUserId: string, text: string, now: Date): Promise<LeadNoteDto> {
  const lead = await db.query("SELECT 1 FROM leads WHERE id = $1 AND removed_at IS NULL", [leadId]);
  if (!lead.rows[0]) throw new NotFoundError("Lead");
  const { rows } = await db.query<NoteRow>(
    "INSERT INTO lead_notes (lead_id, by_user_id, at, text) VALUES ($1, $2, $3, $4) RETURNING id, at, text, by_user_id, edited_at",
    [leadId, byUserId, now, text.trim()],
  );
  return toNote(rows[0]);
}

/** Checks the note is on that lead and that this editor may change it. */
async function checkOwn(db: Queryable, editor: Editor, leadId: string, noteId: string): Promise<void> {
  const { rows } = await db.query<{ by_user_id: string | null }>(
    "SELECT n.by_user_id FROM lead_notes n JOIN leads l ON l.id = n.lead_id WHERE n.id = $1 AND n.lead_id = $2 AND l.removed_at IS NULL",
    [noteId, leadId],
  );
  if (!rows[0]) throw new NotFoundError("Note");
  if (rows[0].by_user_id !== editor.id && editor.role !== "admin") {
    throw new AppError(403, "Only the note's author or an admin can change it", "NOT_YOUR_NOTE");
  }
}

export async function editLeadNote(db: Queryable, editor: Editor, leadId: string, noteId: string, text: string, now: Date): Promise<LeadNoteDto> {
  await checkOwn(db, editor, leadId, noteId);
  const { rows } = await db.query<NoteRow>(
    "UPDATE lead_notes SET text = $3, edited_at = $4 WHERE id = $1 AND lead_id = $2 RETURNING id, at, text, by_user_id, edited_at",
    [noteId, leadId, text.trim(), now],
  );
  if (!rows[0]) throw new NotFoundError("Note");
  return toNote(rows[0]);
}

export async function deleteLeadNote(db: Queryable, editor: Editor, leadId: string, noteId: string): Promise<void> {
  await checkOwn(db, editor, leadId, noteId);
  await db.query("DELETE FROM lead_notes WHERE id = $1 AND lead_id = $2", [noteId, leadId]);
}
