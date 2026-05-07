ALTER TABLE holiday_campaigns ADD COLUMN IF NOT EXISTS form_token text;
ALTER TABLE holiday_campaigns ADD COLUMN IF NOT EXISTS send_date date;

CREATE UNIQUE INDEX IF NOT EXISTS ux_holiday_campaigns_form_token
  ON holiday_campaigns (form_token) WHERE form_token IS NOT NULL;
