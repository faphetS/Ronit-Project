/**
 * Greetings through Zernio (WhatsApp's own API). A business message outside the 24 hours after a
 * customer wrote must be a template Meta approved, so every greeting text becomes one: a holiday
 * greeting is sent for review before Ronit approves it, and the birthday text when it's saved.
 * Spec: docs/superpowers/specs/2026-11-03-greetings-zernio-design.md
 */
export const WHATSAPP_TEMPLATES = `
-- Every template made from a greeting, and Meta's verdict on it.
CREATE TABLE whatsapp_templates (
  name text PRIMARY KEY,
  language text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('holiday', 'birthday')),
  -- The greeting as written, with {שם פרטי} and the other placeholders.
  source_text text NOT NULL,
  -- What Meta reviews: each placeholder became the next {{1}}, {{2}}…
  body text NOT NULL,
  -- Which value fills each {{n}}, in order: firstName, groupName or age.
  tokens text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'PENDING_DELETION')),
  -- Meta's reason on a rejection.
  reason text,
  created_by uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz
);
CREATE INDEX whatsapp_templates_waiting_idx ON whatsapp_templates (created_at) WHERE status IN ('PENDING', 'IN_APPEAL');

-- A holiday greeting now goes through WhatsApp's review ('in-review') before Ronit approves it.
ALTER TABLE campaigns DROP CONSTRAINT campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'in-review', 'awaiting-approval', 'scheduled', 'sending', 'completed'));
ALTER TABLE campaigns
  ADD COLUMN template_name text REFERENCES whatsapp_templates (name) ON DELETE SET NULL,
  ADD COLUMN saved_by uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  ADD COLUMN last_test_at timestamptz,
  ADD COLUMN last_test_by uuid REFERENCES staff_users (id) ON DELETE SET NULL;

-- The approved birthday template in use, and a newer text waiting for Meta (or rejected).
ALTER TABLE birthday_settings
  ADD COLUMN template_name text REFERENCES whatsapp_templates (name) ON DELETE SET NULL,
  ADD COLUMN pending_template_name text REFERENCES whatsapp_templates (name) ON DELETE SET NULL;

-- A message sent as a template carries its values, in the template's order.
ALTER TABLE messages
  ADD COLUMN template_name text,
  ADD COLUMN template_language text,
  ADD COLUMN template_params jsonb;

-- Every Zernio webhook event applied, by its id: a retried or replayed delivery is applied once.
CREATE TABLE zernio_webhook_events (
  id text PRIMARY KEY,
  event text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
`;
