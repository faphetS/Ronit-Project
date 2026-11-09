/**
 * Password sign-in next to Google: a username the office picks (the email works too) and a
 * password an admin sets or its owner changes, stored only as a scrypt hash. Wrong passwords
 * have their own count and lock, so a stranger guessing can't lock anyone out of Google.
 * Design: docs/superpowers/specs/2026-11-09-password-sign-in-design.md
 */
export const PASSWORD_SIGN_IN = `
ALTER TABLE staff_users
  ADD COLUMN username text UNIQUE,
  ADD COLUMN password_hash text,
  ADD COLUMN password_changed_at timestamptz,
  ADD COLUMN password_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN password_locked_until timestamptz,
  ADD CONSTRAINT staff_users_username_format CHECK (username ~ '^[a-z][a-z0-9._-]{2,31}$');
`;
