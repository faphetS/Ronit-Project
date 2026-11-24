/**
 * Staff tagged in a lead's note (@-mentions), and when each one saw it. Someone tagged in their own note is stored as
 * seen. Deleting the note, or the staff account, takes the tag with it.
 */
export const LEAD_NOTE_MENTIONS = `
CREATE TABLE lead_note_mentions (
  note_id uuid NOT NULL REFERENCES lead_notes (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  PRIMARY KEY (note_id, user_id)
);
CREATE INDEX lead_note_mentions_user_idx ON lead_note_mentions (user_id, seen_at);
`;
