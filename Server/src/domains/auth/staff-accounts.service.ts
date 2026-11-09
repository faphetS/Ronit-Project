import { logger } from "../../config/logger.js";
import type { Queryable } from "../../config/pg.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Mailer } from "../../lib/mailer.js";
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, passwordLength } from "../../lib/passwords.js";
import { hashToken } from "../../lib/tokens.js";
import { inviteEmail } from "./auth.emails.js";
import { normalizeEmail, recordAudit, tryPassword, type AuthDeps, type Role } from "./auth.service.js";

/**
 * Registering dashboard accounts and looking after them: from the dashboard's users screen, and
 * from the server console (scripts/staff-user.ts). `byUserId` is the admin who did it (null on
 * the console).
 */

export type AccountDeps = Pick<AuthDeps, "db" | "dashboardUrl" | "now"> & {
  /** Null when SMTP isn't set up: the invite is then passed on by hand. */
  mailer: Mailer | null;
};

export interface StaffInvite {
  /** The email of the Google account they'll sign in with. */
  email: string;
  name: string;
  role: Role;
  passportAccess: boolean;
  /** Digits with the country code, for greetings sent "to my WhatsApp". */
  whatsappPhone: string | null;
  /** What they can type instead of the email, like "ronit". None: they type the email. */
  username?: string | null;
  /** A first password the office passes on by hand. None: Google is the way in until one is set. */
  password?: string | null;
}

const USERNAME = /^[a-z][a-z0-9._-]{2,31}$/;

const usernameTaken = () => new AppError(409, "That username is taken", "USERNAME_TAKEN");
const wrongPassword = () => new AppError(400, "The current password is wrong", "WRONG_PASSWORD");

/** "Ronit " is "ronit"; "" is no username. A username never has "@", so it can't pass for an email. */
export function cleanUsername(value: string | null | undefined): string | null {
  const username = (value ?? "").trim().toLowerCase();
  if (!username) return null;
  if (!USERNAME.test(username)) {
    throw new AppError(400, "A username is 3 to 32 characters: a Latin letter, then Latin letters, digits, dots, dashes or underscores", "INVALID_USERNAME");
  }
  return username;
}

/** Only the length counts: 8 to 128 characters. */
export function checkNewPassword(password: string): void {
  const length = passwordLength(password);
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) {
    throw new AppError(400, `A password is ${PASSWORD_MIN} to ${PASSWORD_MAX} characters`, "WEAK_PASSWORD");
  }
}

async function newPasswordHash(password: string): Promise<string> {
  checkNewPassword(password);
  return hashPassword(password);
}

async function assertUsernameFree(q: Queryable, username: string | null, ownId: string | null): Promise<void> {
  if (!username) return;
  const { rows } = await q.query("SELECT 1 FROM staff_users WHERE username = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)", [username, ownId]);
  if (rows.length > 0) throw usernameTaken();
}

/** Postgres' unique violation: two admins picked the same username at the same moment. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";
}

async function userIdByEmail(q: Queryable, email: string): Promise<string> {
  const { rows } = await q.query<{ id: string }>("SELECT id FROM staff_users WHERE email = $1", [normalizeEmail(email)]);
  if (!rows[0]) throw new NotFoundError("Staff user");
  return rows[0].id;
}

/** Ends the person's sessions and the codes waiting for them, and forgets their remembered devices. */
async function signOutEverywhere(tx: Queryable, userId: string, now: Date): Promise<void> {
  await tx.query("UPDATE staff_sessions SET ended_at = $2 WHERE user_id = $1 AND ended_at IS NULL", [userId, now]);
  await tx.query("UPDATE staff_sign_in_challenges SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL", [userId, now]);
  await tx.query("UPDATE staff_devices SET trusted_until = NULL WHERE user_id = $1", [userId]);
}

/** After changing your own password: every other session and waiting code ends; this session and the remembered devices stay. */
async function signOutElsewhere(tx: Queryable, userId: string, keepSessionToken: string, now: Date): Promise<void> {
  await tx.query("UPDATE staff_sessions SET ended_at = $2 WHERE user_id = $1 AND ended_at IS NULL AND token_hash <> $3", [
    userId,
    now,
    hashToken(keepSessionToken),
  ]);
  await tx.query("UPDATE staff_sign_in_challenges SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL", [userId, now]);
}

async function savePassword(tx: Queryable, userId: string, passwordHash: string, now: Date): Promise<void> {
  await tx.query(
    `UPDATE staff_users SET password_hash = $2, password_changed_at = $3, password_failures = 0, password_locked_until = NULL, updated_at = $3
     WHERE id = $1`,
    [userId, passwordHash, now],
  );
}

/**
 * Registers the account and emails the invite. The person signs in with the username (or the
 * email) and the password the office gives them, or with this email's Google account. A
 * removed account under the same email is opened again, as a new invite.
 */
export async function inviteStaff(
  deps: AccountDeps,
  invite: StaffInvite,
  byUserId: string | null = null,
): Promise<{ userId: string; emailed: boolean }> {
  const now = deps.now();
  const email = normalizeEmail(invite.email);
  const name = invite.name.trim();
  const username = cleanUsername(invite.username);
  const passwordHash = invite.password ? await newPasswordHash(invite.password) : null;
  const userId = await deps.db
    .transaction(async (tx) => {
      await assertUsernameFree(tx, username, null);
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO staff_users (email, name, role, passport_access, whatsapp_phone, username, password_hash, password_changed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name, role = EXCLUDED.role, passport_access = EXCLUDED.passport_access,
           whatsapp_phone = COALESCE(EXCLUDED.whatsapp_phone, staff_users.whatsapp_phone),
           username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, password_changed_at = EXCLUDED.password_changed_at,
           password_failures = 0, password_locked_until = NULL,
           disabled_at = NULL, google_sub = NULL, failed_sign_ins = 0, locked_until = NULL, updated_at = EXCLUDED.updated_at
         WHERE staff_users.disabled_at IS NOT NULL
         RETURNING id`,
        [email, name, invite.role, invite.passportAccess, invite.whatsappPhone, username, passwordHash, passwordHash ? now : null, now],
      );
      if (!rows[0]) throw new AppError(409, `${email} already has an account`, "ALREADY_REGISTERED");
      await recordAudit(tx, now, "staff-invited", byUserId, {
        userId: rows[0].id,
        role: invite.role,
        passportAccess: invite.passportAccess,
        username,
        withPassword: passwordHash !== null,
      });
      return rows[0].id;
    })
    .catch((err: unknown) => {
      throw isUniqueViolation(err) ? usernameTaken() : err;
    });
  if (!deps.mailer) return { userId, emailed: false };
  try {
    await deps.mailer.send({ to: email, ...inviteEmail({ name, email, username, withPassword: passwordHash !== null, dashboardUrl: deps.dashboardUrl }) });
    return { userId, emailed: true };
  } catch (err) {
    // The account stands; the invite can go out by hand.
    logger.warn({ err, userId }, "invite email failed");
    return { userId, emailed: false };
  }
}

/**
 * For a replaced Google account or a lost phone: unlinks the Google account (the next one to
 * sign in under the email is linked instead) and signs the person out everywhere.
 */
export async function resetSignIn(deps: AccountDeps, email: string): Promise<void> {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const userId = await userIdByEmail(tx, email);
    await tx.query("UPDATE staff_users SET google_sub = NULL, updated_at = $2 WHERE id = $1", [userId, now]);
    await signOutEverywhere(tx, userId, now);
    await recordAudit(tx, now, "sign-in-reset", null, { userId });
  });
}

export interface SignInChange {
  /** Left out: stays as it is. "": no username any more (they type the email). */
  username?: string;
  /** Left out or "": stays as it is. */
  password?: string;
}

/**
 * An admin changes someone's username, or gives them a new password when they forget it. A new
 * password signs the person out everywhere, the same as resetting sign-in, so an old one that
 * leaked stops working at once. An admin doing it on their own account keeps the session
 * they're in (`keepSessionToken`).
 */
export async function setSignIn(
  deps: Pick<AccountDeps, "db" | "now">,
  userId: string,
  change: SignInChange,
  byUserId: string | null = null,
  keepSessionToken: string | null = null,
): Promise<void> {
  const now = deps.now();
  const username = change.username === undefined ? undefined : cleanUsername(change.username);
  const passwordHash = change.password ? await newPasswordHash(change.password) : null;
  await deps.db
    .transaction(async (tx) => {
      const { rows } = await tx.query<{ username: string | null }>(
        "SELECT username FROM staff_users WHERE id = $1 AND disabled_at IS NULL FOR UPDATE",
        [userId],
      );
      if (!rows[0]) throw new NotFoundError("Staff user");
      if (username !== undefined && username !== rows[0].username) {
        await assertUsernameFree(tx, username, userId);
        await tx.query("UPDATE staff_users SET username = $2, updated_at = $3 WHERE id = $1", [userId, username, now]);
        await recordAudit(tx, now, "username-changed", byUserId, { userId, username: username ?? "" });
      }
      if (passwordHash) {
        await savePassword(tx, userId, passwordHash, now);
        if (keepSessionToken) await signOutElsewhere(tx, userId, keepSessionToken, now);
        else await signOutEverywhere(tx, userId, now);
        await recordAudit(tx, now, "password-set", byUserId, { userId, own: userId === byUserId });
      }
    })
    .catch((err: unknown) => {
      throw isUniqueViolation(err) ? usernameTaken() : err;
    });
}

/** setSignIn from the server console, by email. */
export async function setSignInByEmail(deps: Pick<AccountDeps, "db" | "now">, email: string, change: SignInChange): Promise<void> {
  await setSignIn(deps, await userIdByEmail(deps.db, email), change);
}

/**
 * Someone changes their own password from the account panel. When they have one, the current
 * password comes first, and a wrong one counts toward the lock; without one (they came in with
 * Google) they set their first. Their other sessions end; the one in use stays.
 */
export async function changeOwnPassword(
  deps: Pick<AuthDeps, "db" | "now">,
  userId: string,
  sessionToken: string,
  input: { current?: string; next: string },
): Promise<void> {
  const now = deps.now();
  // Before any try is spent on the current password.
  checkNewPassword(input.next);
  const { rows } = await deps.db.query<{ password_hash: string | null }>(
    "SELECT password_hash FROM staff_users WHERE id = $1 AND disabled_at IS NULL",
    [userId],
  );
  if (!rows[0]) throw new NotFoundError("Staff user");
  const stored = rows[0].password_hash;
  if (stored && !(input.current && (await tryPassword(deps.db, userId, stored, input.current, now)))) throw wrongPassword();
  const passwordHash = await hashPassword(input.next);
  await deps.db.transaction(async (tx) => {
    await savePassword(tx, userId, passwordHash, now);
    await signOutElsewhere(tx, userId, sessionToken, now);
    await recordAudit(tx, now, "password-set", userId, { userId, own: true });
  });
}

/** Closes the account: no sign-in, and every session ended. */
export async function disableStaff(deps: AccountDeps, email: string, byUserId: string | null = null): Promise<void> {
  await disableStaffById(deps, await userIdByEmail(deps.db, email), byUserId);
}

export async function disableStaffById(deps: Pick<AccountDeps, "db" | "now">, userId: string, byUserId: string | null = null): Promise<void> {
  const now = deps.now();
  await deps.db.transaction((tx) => disableStaffIn(tx, userId, byUserId, now));
}

/** disableStaffById inside a transaction the caller holds, for checks that must hold until it commits. */
export async function disableStaffIn(tx: Queryable, userId: string, byUserId: string | null, now: Date): Promise<void> {
  // The username is freed for someone else, and the password goes: an invite later starts fresh.
  const { rows } = await tx.query(
    "UPDATE staff_users SET disabled_at = $2, updated_at = $2, username = NULL, password_hash = NULL WHERE id = $1 AND disabled_at IS NULL RETURNING id",
    [userId, now],
  );
  if (rows.length === 0) throw new NotFoundError("Staff user");
  await signOutEverywhere(tx, userId, now);
  await recordAudit(tx, now, "staff-disabled", byUserId, { userId });
}
