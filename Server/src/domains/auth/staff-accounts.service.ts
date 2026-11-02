import type { Queryable } from "../../config/pg.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { hashToken, newToken } from "../../lib/tokens.js";
import { normalizeEmail, recordAudit, type AuthDeps, type Role, type SetupLinkPurpose } from "./auth.service.js";

/**
 * Creating and looking after dashboard accounts. Run from the server console today
 * (scripts/staff-user.ts); the users screen will call the same functions in step 2.
 */

export type AccountDeps = Pick<AuthDeps, "db" | "dashboardUrl" | "now">;

export const INVITE_HOURS = 72;
export const RESET_HOURS = 24;

export interface StaffInvite {
  email: string;
  name: string;
  role: Role;
  passportAccess: boolean;
  /** Digits with the country code, for greetings sent "to my WhatsApp". */
  whatsappPhone: string | null;
}

const hoursAfter = (at: Date, hours: number) => new Date(at.getTime() + hours * 3_600_000);

/** A one-time link to <DASHBOARD_URL>/setup/<token>. Any older open link of the person stops working. */
async function createSetupLink(tx: Queryable, deps: AccountDeps, userId: string, purpose: SetupLinkPurpose, now: Date): Promise<string> {
  await tx.query("UPDATE staff_setup_links SET expires_at = $2 WHERE user_id = $1 AND used_at IS NULL AND expires_at > $2", [
    userId,
    now,
  ]);
  const token = newToken();
  await tx.query(
    "INSERT INTO staff_setup_links (user_id, token_hash, purpose, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [userId, hashToken(token), purpose, now, hoursAfter(now, purpose === "invite" ? INVITE_HOURS : RESET_HOURS)],
  );
  return `${deps.dashboardUrl.replace(/\/+$/, "")}/setup/${token}`;
}

async function userIdByEmail(q: Queryable, email: string): Promise<string> {
  const { rows } = await q.query<{ id: string }>("SELECT id FROM staff_users WHERE email = $1", [normalizeEmail(email)]);
  if (!rows[0]) throw new NotFoundError("Staff user");
  return rows[0].id;
}

/** Ends the person's sessions and forgets their remembered devices. */
async function signOutEverywhere(tx: Queryable, userId: string, now: Date): Promise<void> {
  await tx.query("UPDATE staff_sessions SET ended_at = $2 WHERE user_id = $1 AND ended_at IS NULL", [userId, now]);
  await tx.query("UPDATE staff_devices SET trusted_until = NULL WHERE user_id = $1", [userId]);
}

/** Creates the account and its invite link. The person sets their password and codes from the link. */
export async function inviteStaff(deps: AccountDeps, invite: StaffInvite): Promise<{ userId: string; link: string }> {
  const now = deps.now();
  const email = normalizeEmail(invite.email);
  return deps.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO staff_users (email, name, role, passport_access, whatsapp_phone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, invite.name.trim(), invite.role, invite.passportAccess, invite.whatsappPhone, now],
    );
    if (!rows[0]) throw new ValidationError(`${email} already has an account — send a reset link instead`);
    const userId = rows[0].id;
    const link = await createSetupLink(tx, deps, userId, "invite", now);
    await recordAudit(tx, now, "staff-invited", null, { userId, role: invite.role, passportAccess: invite.passportAccess });
    return { userId, link };
  });
}

/** A link to choose a new password. The codes stay as they are. */
export async function issueResetLink(deps: AccountDeps, email: string): Promise<string> {
  const now = deps.now();
  return deps.db.transaction(async (tx) => {
    const userId = await userIdByEmail(tx, email);
    const link = await createSetupLink(tx, deps, userId, "reset", now);
    await recordAudit(tx, now, "password-reset-link", null, { userId });
    return link;
  });
}

/** For a lost phone: the codes are set up again at the next sign-in. */
export async function resetTwoStep(deps: AccountDeps, email: string): Promise<void> {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const userId = await userIdByEmail(tx, email);
    await tx.query(
      "UPDATE staff_users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL, updated_at = $2 WHERE id = $1",
      [userId, now],
    );
    await signOutEverywhere(tx, userId, now);
    await recordAudit(tx, now, "two-step-reset", null, { userId });
  });
}

/** Closes the account: no sign-in, no open links, every session ended. */
export async function disableStaff(deps: AccountDeps, email: string): Promise<void> {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const userId = await userIdByEmail(tx, email);
    await tx.query("UPDATE staff_users SET disabled_at = $2, updated_at = $2 WHERE id = $1", [userId, now]);
    await tx.query("UPDATE staff_setup_links SET expires_at = $2 WHERE user_id = $1 AND used_at IS NULL AND expires_at > $2", [userId, now]);
    await signOutEverywhere(tx, userId, now);
    await recordAudit(tx, now, "staff-disabled", null, { userId });
  });
}
