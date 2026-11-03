/**
 * The dashboard's data: a read-only copy of Ronit's Monday boards (leads from the CRM boards,
 * trips and challah events with their participants), refreshed on a schedule, plus the notes
 * staff add in the dashboard. Monday stays the source of truth for everything copied here
 * until the switch-over; nothing in this server writes these rows except the copy.
 */
export const MONDAY_COPY = `
-- The Monday boards the copy reads, and how far it got on each.
CREATE TABLE monday_boards (
  id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('crm', 'crm-archive', 'flight', 'challah')),
  items integer NOT NULL DEFAULT 0,
  groups integer NOT NULL DEFAULT 0,
  monday_updated_at timestamptz,
  copied_at timestamptz,
  -- The newest note copied, so the next copy reads only newer ones from the board's feed.
  notes_through timestamptz,
  -- When every row's notes were last read one by one (daily): catches notes edited or deleted in
  -- Monday, and notes of rows moved in from another board, which the board's feed doesn't list.
  notes_refreshed_at timestamptz,
  -- Gone from the account (deleted or archived in Monday).
  removed_at timestamptz
);

CREATE TABLE monday_copy_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL CHECK (trigger IN ('schedule', 'startup', 'manual')),
  by_user_id uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  boards_read integer NOT NULL DEFAULT 0,
  api_calls integer NOT NULL DEFAULT 0,
  totals jsonb NOT NULL DEFAULT '{}',
  error text
);
CREATE INDEX monday_copy_runs_started_idx ON monday_copy_runs (started_at DESC);

-- Leads: the rows of the CRM boards that have a phone.
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_item_id text NOT NULL UNIQUE,
  monday_board_id text NOT NULL,
  monday_group text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  service text CHECK (service IN ('uman', 'challah')),
  status text NOT NULL
    CHECK (status IN ('new', 'no-answer', 'talking', 'details-sent', 'registered', 'not-relevant')),
  -- Monday's "נוצר קשר" label as written, for anyone checking the mapping.
  contact_status text,
  source text NOT NULL CHECK (source IN ('landing-page', 'instagram', 'facebook', 'whatsapp', 'referral')),
  calls integer NOT NULL DEFAULT 0,
  last_call_on date,
  inquiry_on date,
  last_message text,
  next_step text,
  archived boolean NOT NULL DEFAULT false,
  -- Times in Monday.
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  removed_at timestamptz,
  copied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_pipeline_idx ON leads (updated_at DESC) WHERE NOT archived AND removed_at IS NULL;
CREATE INDEX leads_phone_idx ON leads (phone);

-- Monday's notes ("updates") by row, for any row: a chat that later gains a phone keeps its history.
CREATE TABLE monday_notes (
  id text PRIMARY KEY,
  monday_item_id text NOT NULL,
  board_id text NOT NULL,
  at timestamptz NOT NULL,
  author text,
  body text NOT NULL
);
CREATE INDEX monday_notes_item_idx ON monday_notes (monday_item_id, at DESC);

-- A trip from a flight board ('board:<id>'), or a challah month ('month:<board>:<group>').
ALTER TABLE groups
  ADD COLUMN monday_key text UNIQUE,
  ADD COLUMN monday_board_name text,
  ADD COLUMN removed_at timestamptz;

-- One membership per Monday row (a seat on a flight, a booking in a challah month), so a woman
-- booked twice in a month shows twice. Memberships added in the dashboard stay one per person per trip.
ALTER TABLE group_members DROP CONSTRAINT group_members_pkey;
ALTER TABLE group_members
  ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ADD COLUMN monday_item_id text,
  ADD COLUMN monday_status text,
  ADD COLUMN monday_passport text CHECK (monday_passport IN ('yes', 'in-progress')),
  ADD COLUMN event_on date;
CREATE UNIQUE INDEX group_members_monday_item_idx ON group_members (monday_item_id) WHERE monday_item_id IS NOT NULL;
CREATE UNIQUE INDEX group_members_person_idx ON group_members (group_id, customer_id) WHERE monday_item_id IS NULL;
CREATE INDEX group_members_group_idx ON group_members (group_id);

-- Customers the copy created. Only these does it rename or remove.
ALTER TABLE customers ADD COLUMN from_monday boolean NOT NULL DEFAULT false;

-- Notes the staff add on a customer's card in the dashboard.
CREATE TABLE customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  by_user_id uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now(),
  text text NOT NULL CHECK (length(btrim(text)) > 0)
);
CREATE INDEX customer_notes_customer_idx ON customer_notes (customer_id, at DESC);

CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
`;
