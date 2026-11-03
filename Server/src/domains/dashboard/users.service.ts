import type { Queryable } from "../../config/pg.js";
import { AppError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { recordAudit, type AuthDeps, type Role, type SignedInDto } from "../auth/auth.service.js";
import { disableStaffIn, inviteStaff } from "../auth/staff-accounts.service.js";
import { isValidMsisdn, toMsisdn } from "../whatsapp/whatsapp.gateway.js";
import { localPhone } from "./dashboard.format.js";
import { isFixed, permissionTable, type AccessLevel, type PermissionArea, type PermissionRowDto } from "./dashboard.access.js";

/** The users screen: the team, invites, the security switches and the log of sensitive actions. */

export interface UserAccountDto {
  id: string;
  name: string;
  initial: string;
  role: Role;
  passportAccess: boolean;
  /** Only admins see other people's emails. */
  email: string;
  lastSignInAt: string | null;
  /** Active once they've signed in: every new device then needs the emailed code. */
  twoStep: "active" | "not-set";
  /** Their own WhatsApp number, for test greetings ("050…"). Only on their own account; "" when not set. */
  whatsappPhone: string;
}

export interface UserInviteDto {
  id: string;
  email: string;
  role: Role;
  passportAccess: boolean;
  sentAt: string;
  sentByUserId: string;
}

export interface UserDirectoryDto {
  users: UserAccountDto[];
  /** Accounts nobody signed in to yet. Admins only. */
  invites: UserInviteDto[];
}

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  passport_access: boolean;
  linked: boolean;
  last_sign_in_at: Date | null;
  created_at: Date;
  invited_by: string | null;
  whatsapp_phone: string | null;
}

const STAFF_SELECT = `
  SELECT u.id, u.email, u.name, u.role, u.passport_access, u.google_sub IS NOT NULL AS linked, u.last_sign_in_at, u.created_at, u.whatsapp_phone,
    (SELECT a.by_user_id FROM audit_log a WHERE a.action = 'staff-invited' AND a.details->>'userId' = u.id::text
     ORDER BY a.at DESC LIMIT 1) AS invited_by
  FROM staff_users u`;

function toAccount(row: StaffRow, showEmail: boolean, own = false): UserAccountDto {
  return {
    id: row.id,
    name: row.name,
    initial: row.name.trim().charAt(0),
    role: row.role,
    passportAccess: row.passport_access,
    email: showEmail ? row.email : "",
    lastSignInAt: row.last_sign_in_at?.toISOString() ?? null,
    twoStep: row.last_sign_in_at ? "active" : "not-set",
    whatsappPhone: own ? localPhone(row.whatsapp_phone) : "",
  };
}

function toInvite(row: StaffRow): UserInviteDto {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    passportAccess: row.passport_access,
    sentAt: row.created_at.toISOString(),
    sentByUserId: row.invited_by ?? "",
  };
}

/** Everyone with an open account. Admins (`admin`: full access to users) also get emails and the pending invites. */
export async function directory(db: Queryable, viewer: SignedInDto, admin: boolean): Promise<UserDirectoryDto> {
  const { rows } = await db.query<StaffRow>(`${STAFF_SELECT} WHERE u.disabled_at IS NULL ORDER BY u.created_at, u.name`);
  return {
    users: rows.filter((row) => row.linked).map((row) => toAccount(row, admin || row.id === viewer.user.id, row.id === viewer.user.id)),
    invites: admin ? rows.filter((row) => !row.linked).map(toInvite) : [],
  };
}

async function ownAccount(db: Queryable, id: string): Promise<UserAccountDto> {
  const { rows } = await db.query<StaffRow>(`${STAFF_SELECT} WHERE u.id = $1`, [id]);
  if (!rows[0]) throw new NotFoundError("Staff user");
  return toAccount(rows[0], true, true);
}

/**
 * People change their own name and WhatsApp number (for test greetings; "" clears it). The email
 * is the Google account they sign in with, so it stays.
 */
export async function updateProfile(
  db: Queryable,
  viewer: SignedInDto,
  patch: { name: string; whatsappPhone?: string },
  now: Date,
): Promise<UserAccountDto> {
  const name = patch.name.trim();
  if (!name) throw new ValidationError("A name is needed");
  let phone: string | null | undefined;
  if (patch.whatsappPhone !== undefined) {
    phone = patch.whatsappPhone.trim() ? toMsisdn(patch.whatsappPhone) : null;
    if (phone !== null && !isValidMsisdn(phone)) throw new AppError(400, "That isn't a mobile number", "INVALID_PHONE");
  }
  await db.query(
    "UPDATE staff_users SET name = $2, whatsapp_phone = CASE WHEN $3 THEN $4 ELSE whatsapp_phone END, updated_at = $5 WHERE id = $1",
    [viewer.user.id, name, phone !== undefined, phone ?? null, now],
  );
  return ownAccount(db, viewer.user.id);
}

// ---- The role table ----

export function permissions(db: Queryable): Promise<PermissionRowDto[]> {
  return permissionTable(db);
}

export interface PermissionChange {
  role: Role;
  area: PermissionArea;
  access: AccessLevel;
}

/** Changes what a role may do in one area, and logs it when it actually changed. The fixed cells stay. */
export async function changePermission(db: Queryable, viewer: SignedInDto, change: PermissionChange, now: Date): Promise<PermissionRowDto[]> {
  if (isFixed(change.role, change.area)) throw new AppError(400, "This permission can't be changed", "PERMISSION_FIXED");
  const { rows } = await db.query(
    `INSERT INTO role_permissions (role, area, access, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (role, area) DO UPDATE SET access = EXCLUDED.access, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
     WHERE role_permissions.access IS DISTINCT FROM EXCLUDED.access
     RETURNING role`,
    [change.role, change.area, change.access, now, viewer.user.id],
  );
  if (rows.length > 0) await recordAudit(db, now, "permission-change", viewer.user.id, { ...change });
  return permissionTable(db);
}

// ---- Security switches ----

export const SECURITY_SWITCHES = ["twoStepRequired", "maskPassportNumbers", "autoSignOut", "passportAccessLog"] as const;
export type SecuritySwitch = (typeof SECURITY_SWITCHES)[number];

const SWITCH_COLUMNS: Record<SecuritySwitch, string> = {
  twoStepRequired: "two_step_required",
  maskPassportNumbers: "mask_passport_numbers",
  autoSignOut: "auto_sign_out",
  passportAccessLog: "passport_access_log",
};

export type SecuritySettingsDto = Record<SecuritySwitch, boolean> & { autoSignOutMinutes: number };

export async function securitySettings(db: Queryable): Promise<SecuritySettingsDto> {
  const { rows } = await db.query<{
    two_step_required: boolean;
    mask_passport_numbers: boolean;
    auto_sign_out: boolean;
    passport_access_log: boolean;
    auto_sign_out_minutes: number;
  }>("SELECT two_step_required, mask_passport_numbers, auto_sign_out, passport_access_log, auto_sign_out_minutes FROM security_settings");
  const row = rows[0];
  return {
    twoStepRequired: row.two_step_required,
    maskPassportNumbers: row.mask_passport_numbers,
    autoSignOut: row.auto_sign_out,
    passportAccessLog: row.passport_access_log,
    autoSignOutMinutes: row.auto_sign_out_minutes,
  };
}

/** Flips one switch, and logs it when it actually changed. */
export async function updateSecurity(
  db: Queryable,
  viewer: SignedInDto,
  setting: SecuritySwitch,
  enabled: boolean,
  now: Date,
): Promise<SecuritySettingsDto> {
  const column = SWITCH_COLUMNS[setting];
  const { rows } = await db.query(
    `UPDATE security_settings SET ${column} = $1, updated_at = $2, updated_by = $3 WHERE ${column} IS DISTINCT FROM $1 RETURNING id`,
    [enabled, now, viewer.user.id],
  );
  if (rows.length > 0) await recordAudit(db, now, "security-change", viewer.user.id, { setting, enabled });
  return securitySettings(db);
}

// ---- The log of sensitive actions ----

interface AuditBase {
  id: string;
  at: string;
  byUserId: string | null;
}

export type AuditEntryDto = AuditBase &
  (
    | { action: "passport-view" | "passport-photo-view"; customerId: string; customerName: string }
    | { action: "greeting-edit" | "greeting-approve" | "greeting-test"; campaignId: string; holiday: string }
    | { action: "security-change"; setting: SecuritySwitch; enabled: boolean }
    | { action: "new-device-sign-in" | "sign-in-locked" | "monday-copy" }
    | { action: "staff-invited" | "staff-removed"; userId: string; userName: string }
    | { action: "staff-access-changed"; userId: string; userName: string; role: Role; passportAccess: boolean }
    | { action: "permission-change"; role: Role; area: PermissionArea; access: AccessLevel }
    | { action: "sign-in-refused"; email: string }
  );

const LOGGED = [
  "passport-view",
  "passport-photo-view",
  "greeting-edit",
  "greeting-approve",
  "greeting-test",
  "security-change",
  "new-device-sign-in",
  "sign-in-locked",
  "sign-in-refused",
  "monday-copy",
  "staff-invited",
  "staff-disabled",
  "staff-access-changed",
  "permission-change",
];

/** Newest first. */
export async function auditLog(db: Queryable): Promise<AuditEntryDto[]> {
  const { rows } = await db.query<{
    id: string;
    at: Date;
    by_user_id: string | null;
    action: string;
    customer_id: string | null;
    campaign_id: string | null;
    details: Record<string, unknown>;
    customer_name: string | null;
    holiday: string | null;
    target_name: string | null;
  }>(
    `SELECT a.id, a.at, a.by_user_id, a.action, a.customer_id, a.campaign_id, a.details,
       c.first_name || ' ' || c.last_name AS customer_name, camp.holiday, target.name AS target_name
     FROM audit_log a
     LEFT JOIN customers c ON c.id = a.customer_id
     LEFT JOIN campaigns camp ON camp.id = a.campaign_id
     LEFT JOIN staff_users target ON target.id::text = a.details->>'userId'
     WHERE a.action = ANY($1::text[])
     ORDER BY a.at DESC, a.id LIMIT 100`,
    [LOGGED],
  );
  return rows.flatMap((row): AuditEntryDto[] => {
    const base = { id: row.id, at: row.at.toISOString(), byUserId: row.by_user_id };
    const detail = (key: string) => row.details[key];
    switch (row.action) {
      case "passport-view":
      case "passport-photo-view":
        return row.customer_id
          ? [{ ...base, action: row.action, customerId: row.customer_id, customerName: (row.customer_name ?? String(detail("customerName") ?? "")).trim() }]
          : [];
      case "greeting-edit":
      case "greeting-approve":
      case "greeting-test":
        return row.campaign_id ? [{ ...base, action: row.action, campaignId: row.campaign_id, holiday: row.holiday ?? "" }] : [];
      case "security-change":
        return [{ ...base, action: "security-change", setting: detail("setting") as SecuritySwitch, enabled: detail("enabled") === true }];
      case "new-device-sign-in":
      case "sign-in-locked":
      case "monday-copy":
        return [{ ...base, action: row.action }];
      case "staff-invited":
      case "staff-disabled":
        return [{ ...base, action: row.action === "staff-invited" ? "staff-invited" : "staff-removed", userId: String(detail("userId") ?? ""), userName: row.target_name ?? "" }];
      case "staff-access-changed":
        return [
          {
            ...base,
            action: "staff-access-changed",
            userId: String(detail("userId") ?? ""),
            userName: row.target_name ?? "",
            role: detail("role") as Role,
            passportAccess: detail("passportAccess") === true,
          },
        ];
      case "permission-change":
        return [{ ...base, action: "permission-change", role: detail("role") as Role, area: detail("area") as PermissionArea, access: detail("access") as AccessLevel }];
      case "sign-in-refused":
        return [{ ...base, action: "sign-in-refused", email: String(detail("email") ?? "") }];
      default:
        return [];
    }
  });
}

// ---- Inviting and removing ----

export interface InviteInput {
  email: string;
  name: string;
  role: Role;
  passportAccess: boolean;
}

/** Registers the account and emails the invite. Sales never get passport access. */
export async function invite(deps: AuthDeps, viewer: SignedInDto, input: InviteInput): Promise<{ invite: UserInviteDto; emailed: boolean }> {
  const { userId, emailed } = await inviteStaff(
    deps,
    { email: input.email, name: input.name, role: input.role, passportAccess: input.role !== "sales" && input.passportAccess, whatsappPhone: null },
    viewer.user.id,
  );
  const { rows } = await deps.db.query<StaffRow>(`${STAFF_SELECT} WHERE u.id = $1`, [userId]);
  return { invite: toInvite(rows[0]), emailed };
}

export interface AccessInput {
  role: Role;
  passportAccess: boolean;
}

/**
 * Changes someone's role and passport access, or a pending invite's. It applies from their next
 * request. Your own role is changed by another admin, the last admin stays an admin, and sales
 * never get passport access. Answers with the team as it now stands.
 */
export async function changeAccess(deps: Pick<AuthDeps, "db" | "now">, viewer: SignedInDto, userId: string, input: AccessInput): Promise<UserDirectoryDto> {
  const now = deps.now();
  const passportAccess = input.role !== "sales" && input.passportAccess;
  await deps.db.transaction(async (tx) => {
    await lockAdmins(tx);
    const { rows } = await tx.query<{ role: Role; passport_access: boolean }>(
      "SELECT role, passport_access FROM staff_users WHERE id = $1 AND disabled_at IS NULL FOR UPDATE",
      [userId],
    );
    const before = rows[0];
    if (!before) throw new NotFoundError("Staff user");
    if (before.role === input.role && before.passport_access === passportAccess) return;
    if (userId === viewer.user.id && before.role !== input.role) {
      throw new AppError(400, "Another admin changes your own role", "CANNOT_CHANGE_OWN_ROLE");
    }
    if (before.role === "admin" && input.role !== "admin") {
      const { rows: admins } = await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM staff_users WHERE role = 'admin' AND disabled_at IS NULL");
      if (admins[0].n <= 1) throw new AppError(400, "The last admin stays an admin", "LAST_ADMIN");
    }
    await tx.query("UPDATE staff_users SET role = $2, passport_access = $3, updated_at = $4 WHERE id = $1", [userId, input.role, passportAccess, now]);
    await recordAudit(tx, now, "staff-access-changed", viewer.user.id, {
      userId,
      role: input.role,
      passportAccess,
      before: { role: before.role, passportAccess: before.passport_access },
    });
  });
  return directory(deps.db, viewer, true);
}

/**
 * Locks every open admin account, always in the same order, before the last-admin check: two admins
 * demoting or removing each other at once then take turns, and the second sees the first's change.
 */
async function lockAdmins(tx: Queryable): Promise<void> {
  await tx.query("SELECT id FROM staff_users WHERE role = 'admin' AND disabled_at IS NULL ORDER BY id FOR UPDATE");
}

/** Closes someone's account and signs them out everywhere. Not yourself, and never the last admin. */
export async function removeUser(deps: Pick<AuthDeps, "db" | "now">, viewer: SignedInDto, userId: string): Promise<void> {
  if (userId === viewer.user.id) throw new AppError(400, "You can't remove your own account", "CANNOT_REMOVE_SELF");
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    await lockAdmins(tx);
    const { rows } = await tx.query<{ role: Role; admins: number }>(
      `SELECT u.role, (SELECT count(*)::int FROM staff_users WHERE role = 'admin' AND disabled_at IS NULL) AS admins
       FROM staff_users u WHERE u.id = $1 AND u.disabled_at IS NULL FOR UPDATE OF u`,
      [userId],
    );
    if (!rows[0]) throw new NotFoundError("Staff user");
    if (rows[0].role === "admin" && rows[0].admins <= 1) throw new AppError(400, "The last admin can't be removed", "LAST_ADMIN");
    await disableStaffIn(tx, userId, viewer.user.id, now);
  });
}
