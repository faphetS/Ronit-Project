CREATE TABLE IF NOT EXISTS holiday_campaigns (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  holiday_date    date        NOT NULL,
  holiday_name    text        NOT NULL,
  holiday_hebrew  text,
  prompt_sent_at  timestamptz,
  prompt_message_id text,
  reply_text      text,
  reply_received_at timestamptz,
  status          text        NOT NULL DEFAULT 'pending_reply',
  broadcast_started_at timestamptz,
  broadcast_finished_at timestamptz,
  total_recipients int        DEFAULT 0,
  total_sent       int        DEFAULT 0,
  total_failed     int        DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_holiday_campaigns_date
  ON holiday_campaigns (holiday_date);

CREATE TABLE IF NOT EXISTS holiday_campaign_sends (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id     bigint      NOT NULL REFERENCES holiday_campaigns(id),
  monday_item_id  text        NOT NULL,
  phone           text        NOT NULL,
  lead_name       text,
  message_id      text,
  status          text        NOT NULL DEFAULT 'pending',
  error           text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_holiday_sends_campaign
  ON holiday_campaign_sends (campaign_id);

CREATE TABLE IF NOT EXISTS followup_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  monday_item_id  text        NOT NULL,
  phone           text        NOT NULL,
  lead_name       text,
  last_call_date  date        NOT NULL,
  message_id      text,
  status          text        NOT NULL DEFAULT 'sent',
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_followup_item_calldate
  ON followup_log (monday_item_id, last_call_date);

ALTER TABLE holiday_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_log ENABLE ROW LEVEL SECURITY;
