/**
 * A lead's status can change in the CRM (spec 2026-11-24): when and by whom, and the "נוצר קשר" label still on its
 * way to Monday, with the tries so far and when to try next. Monday's own edits keep arriving with the 2-hourly copy.
 */
export const LEAD_STATUS_IN_CRM = `
ALTER TABLE leads
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN status_changed_by uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  ADD COLUMN monday_label_pending text,
  ADD COLUMN monday_sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN monday_sync_error text,
  ADD COLUMN monday_sync_next_at timestamptz;
CREATE INDEX leads_monday_pending_idx ON leads (monday_sync_next_at) WHERE monday_label_pending IS NOT NULL;
`;
