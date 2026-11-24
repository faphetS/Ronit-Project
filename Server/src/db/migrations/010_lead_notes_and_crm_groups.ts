/**
 * Notes on each lead, kept in the CRM (spec 2026-11-24); a lead can link to its customer card; and groups made in the CRM
 * can also be projects.
 */
export const LEAD_NOTES_AND_CRM_GROUPS = `
CREATE TABLE lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  by_user_id uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now(),
  text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 2000),
  edited_at timestamptz
);
CREATE INDEX lead_notes_lead_idx ON lead_notes (lead_id, at DESC);
ALTER TABLE leads ADD COLUMN customer_id uuid REFERENCES customers (id) ON DELETE SET NULL;
ALTER TABLE groups DROP CONSTRAINT groups_kind_check;
ALTER TABLE groups ADD CONSTRAINT groups_kind_check CHECK (kind IN ('flight', 'event', 'project'));
`;
