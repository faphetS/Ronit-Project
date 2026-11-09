# Password sign-in, with Google as the shortcut

**Date:** 2026-11-09
**Status:** approved by the user ("go build it")
**Builds on:** `2026-11-02-staff-sign-in-design.md` (Google, then an emailed code on new devices)

## Why

The user asked for "a username and password in the ronit crm but have a google login as well so its like a shortcut". Until now the dashboard had Google sign-in only. Staff who don't use a Google account, or don't want to, had no way in.

## What the user chose

- **What people type:** a username or their email, in the same box. The office picks the username (for example `ronit`).
- **Who sets the password:** the office. An admin types a first password when adding someone, or a new one when they forget it. Each person can change their own from the account panel.

## How it works

### Sign-in screen
- A box for the username or email, a password box with show/hide, and **Sign in**.
- Under them, "or", then Google's button as before.
- "Remember me" covers both ways.
- After the password, the flow is the same as after Google. A device that isn't remembered gets the 6-digit code by email; the two-step switch on the users screen still decides whether that code is needed.

### Users screen (admins)
- **Adding someone:** optional username and first password, next to the email, name, role and passport access.
- **Editing someone:** change the username, or set a new password. A new password ends the person's sessions, cancels their pending codes and forgets their remembered devices, the same as resetting sign-in.
- **The invite email** names the username when there is one. It never carries the password: the office passes it on by hand.
- The team list counts a person as joined after their first sign-in, by either way. Before, only a linked Google account counted.

### Account panel (everyone)
- **Change password**, shown when the person has one: the current password, then the new one. Their other sessions end; the one in use stays.

## Rules

- **Usernames:** 3 to 32 characters. They start with a Latin letter, then Latin letters, digits, `.`, `_` or `-`. They're stored in lower case and unique. A username can't contain `@`, so it never collides with an email.
- **Passwords:** 8 to 128 characters, with no other rules.
- **Storage:** scrypt from Node's own crypto (N=2^15, r=8, p=3, 16-byte salt), kept as `scrypt$N$r$p$salt$hash`, so the cost can rise later without breaking old hashes.
- **Wrong passwords:** 5 in a row lock password sign-in for 15 minutes. The lock has its own counter, so Google still works during it and a stranger guessing can't lock the person out.
- **One message for every failure:** an unknown username, an account without a password and a wrong password all answer "wrong username or password". An unknown username still runs a hash, so the answer takes about as long.
- **Changing your own password:** a wrong current password counts toward the same lock.
- **The access log** records `password-set` (an admin set it, or the person changed it), `username-changed` and `password-locked`.
- **Rate limit:** `POST /api/auth/password` sits behind the same per-address sign-in limiter and Origin check as the other sign-in routes.

## API

| Route | Body | Answer |
| --- | --- | --- |
| `POST /api/auth/password` | `{ login, password, remember, returnTo }` | Same as `/google/credential`: signed in, or `code-required` |
| `POST /api/dashboard/users/me/password` | `{ current, next }` | `null`; `WRONG_PASSWORD` (400) or `TOO_MANY_ATTEMPTS` (429) |
| `POST /api/dashboard/users/:id/sign-in` | `{ username?, password? }` (admins) | The team as it now stands |
| `POST /api/dashboard/users/invites` | adds optional `username` and `password` | As before |

The errors are `INVALID_LOGIN` (401), `USERNAME_TAKEN` (409), `INVALID_USERNAME` (400) and `WEAK_PASSWORD` (400).

## Database (migration 006)

On `staff_users`:
- `username` (text, unique, lower case, format check);
- `password_hash` (text);
- `password_changed_at` (timestamptz);
- `password_failures` (integer, default 0);
- `password_locked_until` (timestamptz).

## Out of scope

- A "forgot password" email. The office sets a new password, or the person uses Google.
- Forcing a change of the office's first password.
- Signing in with only a username and no email: every account keeps its email, because the codes go there.
