/**
 * Each lead note has a kind: a plain note, a question, or an answer (the office asked to tell questions and their answers
 * apart at a glance). Notes written before this are plain notes.
 */
export const LEAD_NOTE_CATEGORIES = `
ALTER TABLE lead_notes ADD COLUMN category text NOT NULL DEFAULT 'note' CHECK (category IN ('note', 'question', 'answer'));
`;
