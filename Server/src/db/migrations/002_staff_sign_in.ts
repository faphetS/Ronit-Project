/**
 * Staff sign-in for the dashboard: passwords, authenticator codes, sessions, remembered
 * devices, invite and reset links, and the security switches of the users screen. Every
 * token is stored as its SHA-256 only; authenticator keys are sealed with AUTH_SECRET.
 */
export const STAFF_SIGN_IN = `
ALTER TABLE staff_users
  ADD COLUMN password_hash text,
  ADD COLUMN totp_secret text,
  ADD COLUMN totp_enabled_at timestamptz,
  ADD COLUMN totp_last_step bigint,
  ADD COLUMN failed_sign_ins integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN last_sign_in_at timestamptz,
  ADD COLUMN disabled_at timestamptz,
  ADD CONSTRAINT staff_users_email_lowercase CHECK (email = lower(email));

CREATE TABLE staff_setup_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX staff_setup_links_user_idx ON staff_setup_links (user_id);

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

-- The step after a correct password: a code, or setting up the authenticator app.
CREATE TABLE staff_sign_in_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('code', 'setup')),
  remember boolean NOT NULL,
  pending_totp_secret text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK ((kind = 'setup') = (pending_totp_secret IS NOT NULL))
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
