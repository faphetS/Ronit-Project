/**
 * The CRM tables behind the dashboard's automations: customers and their passports, trips,
 * passport intakes from WhatsApp, holiday campaigns, birthday settings, the message
 * outbox/history and the audit log. Phones are stored as digits with the country code and
 * no plus (972501234567), the format the WhatsApp gateway takes.
 */
export const CRM_FOUNDATION = `
CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'office', 'sales')),
  passport_access boolean NOT NULL DEFAULT false,
  whatsapp_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  first_name_latin text,
  last_name_latin text,
  phone text,
  source text NOT NULL DEFAULT 'whatsapp'
    CHECK (source IN ('landing-page', 'instagram', 'facebook', 'whatsapp', 'referral', 'monday', 'manual')),
  monday_item_id text,
  greetings_opt_out boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_phone_idx ON customers (phone);

CREATE TABLE passports (
  customer_id uuid PRIMARY KEY REFERENCES customers (id) ON DELETE CASCADE,
  number text NOT NULL,
  nationality text,
  sex text CHECK (sex IN ('F', 'M', 'X')),
  birth_date date,
  issue_date date,
  expiry_date date,
  photo_path text,
  received_via text NOT NULL CHECK (received_via IN ('whatsapp', 'monday', 'manual')),
  received_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  kind text NOT NULL CHECK (kind IN ('flight', 'event')),
  women_only boolean NOT NULL DEFAULT false,
  capacity integer,
  starts_on date,
  ends_on date,
  date_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  note text,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, customer_id)
);
CREATE INDEX group_members_customer_idx ON group_members (customer_id);

CREATE TABLE passport_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('whatsapp', 'script')),
  external_id text,
  sender_phone text,
  sender_name text,
  received_at timestamptz NOT NULL,
  photo_path text NOT NULL,
  photo_mime text NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'matched', 'new-card', 'needs-review', 'not-passport', 'failed')),
  reason text,
  customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  extracted jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
CREATE INDEX passport_intakes_retry_idx ON passport_intakes (updated_at) WHERE status IN ('received', 'failed');

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday text NOT NULL,
  hebrew_year integer NOT NULL,
  eve date NOT NULL,
  send_at timestamptz NOT NULL,
  message text NOT NULL,
  audience_kind text NOT NULL DEFAULT 'all' CHECK (audience_kind IN ('all', 'groups')),
  audience_group_ids uuid[] NOT NULL DEFAULT '{}',
  rate_messages integer NOT NULL DEFAULT 50 CHECK (rate_messages > 0),
  rate_every_minutes integer NOT NULL DEFAULT 10 CHECK (rate_every_minutes > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting-approval', 'scheduled', 'sending', 'completed')),
  approved_at timestamptz,
  approved_by uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  queued_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holiday, hebrew_year)
);

CREATE TABLE birthday_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  send_time time NOT NULL DEFAULT '09:00',
  shabbat_rule text NOT NULL DEFAULT 'after-shabbat' CHECK (shabbat_rule IN ('after-shabbat', 'before-shabbat')),
  template text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO birthday_settings DEFAULT VALUES;

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('holiday', 'birthday')),
  dedup_key text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns (id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  body text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  failure text,
  provider_message_id text UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_due_idx ON messages (send_at) WHERE status = 'queued';
CREATE INDEX messages_customer_idx ON messages (customer_id);
CREATE INDEX messages_campaign_idx ON messages (campaign_id, status);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  by_user_id uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  action text NOT NULL,
  customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns (id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_customer_idx ON audit_log (customer_id, at DESC);
`;
