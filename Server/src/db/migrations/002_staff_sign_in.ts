/**
 * Staff sign-in for the dashboard: "Continue with Google" for registered emails, then a
 * 6-digit code by email on a new device, then a session. Also the security switches of the
 * users screen. Tokens and codes are stored only as hashes.
 */
export const STAFF_SIGN_IN = `
ALTER TABLE staff_users
  ADD COLUMN google_sub text UNIQUE,
  ADD COLUMN failed_sign_ins integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN last_sign_in_at timestamptz,
  ADD COLUMN disabled_at timestamptz,
  ADD CONSTRAINT staff_users_email_lowercase CHECK (email = lower(email));

CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  remember boolean NOT NULL,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ip text,
  user_agent text
);
CREATE INDEX staff_sessions_open_idx ON staff_sessions (user_id) WHERE ended_at IS NULL;

-- One row per browser and person: several people can be remembered on one office computer.
CREATE TABLE staff_devices (
  token_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  trusted_until timestamptz,
  user_agent text,
  PRIMARY KEY (token_hash, user_id)
);

-- After Google: the code emailed to the person, until it's typed in.
CREATE TABLE staff_sign_in_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  remember boolean NOT NULL,
  return_to text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  sends integer NOT NULL DEFAULT 1,
  last_sent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE security_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  two_step_required boolean NOT NULL DEFAULT true,
  mask_passport_numbers boolean NOT NULL DEFAULT true,
  auto_sign_out boolean NOT NULL DEFAULT true,
  auto_sign_out_minutes integer NOT NULL DEFAULT 30 CHECK (auto_sign_out_minutes BETWEEN 5 AND 720),
  passport_access_log boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES staff_users (id) ON DELETE SET NULL
);
INSERT INTO security_settings DEFAULT VALUES;
`;
