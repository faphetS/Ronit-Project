import { logger } from "../../config/logger.js";
import type { Queryable } from "../../config/pg.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Mailer } from "../../lib/mailer.js";
import { inviteEmail } from "./auth.emails.js";
import { normalizeEmail, recordAudit, type AuthDeps, type Role } from "./auth.service.js";

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

/**
 * Registers the account and emails the invite. Only this email's Google account can then sign in.
 * A removed account under the same email is opened again, as a new invite.
 */
export async function inviteStaff(
  deps: AccountDeps,
  invite: StaffInvite,
  byUserId: string | null = null,
): Promise<{ userId: string; emailed: boolean }> {
  const now = deps.now();
  const email = normalizeEmail(invite.email);
  const name = invite.name.trim();
  const userId = await deps.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO staff_users (email, name, role, passport_access, whatsapp_phone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name, role = EXCLUDED.role, passport_access = EXCLUDED.passport_access,
         whatsapp_phone = COALESCE(EXCLUDED.whatsapp_phone, staff_users.whatsapp_phone),
         disabled_at = NULL, google_sub = NULL, failed_sign_ins = 0, locked_until = NULL, updated_at = EXCLUDED.updated_at
       WHERE staff_users.disabled_at IS NOT NULL
       RETURNING id`,
      [email, name, invite.role, invite.passportAccess, invite.whatsappPhone, now],
    );
    if (!rows[0]) throw new AppError(409, `${email} already has an account`, "ALREADY_REGISTERED");
    await recordAudit(tx, now, "staff-invited", byUserId, { userId: rows[0].id, role: invite.role, passportAccess: invite.passportAccess });
    return rows[0].id;
  });
  if (!deps.mailer) return { userId, emailed: false };
  try {
    await deps.mailer.send({ to: email, ...inviteEmail({ name, email, dashboardUrl: deps.dashboardUrl }) });
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

/** Closes the account: no sign-in, and every session ended. */
export async function disableStaff(deps: AccountDeps, email: string, byUserId: string | null = null): Promise<void> {
  await disableStaffById(deps, await userIdByEmail(deps.db, email), byUserId);
}

export async function disableStaffById(deps: Pick<AccountDeps, "db" | "now">, userId: string, byUserId: string | null = null): Promise<void> {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const { rows } = await tx.query("UPDATE staff_users SET disabled_at = $2, updated_at = $2 WHERE id = $1 AND disabled_at IS NULL RETURNING id", [
      userId,
      now,
    ]);
    if (rows.length === 0) throw new NotFoundError("Staff user");
    await signOutEverywhere(tx, userId, now);
    await recordAudit(tx, now, "staff-disabled", byUserId, { userId });
  });
}
