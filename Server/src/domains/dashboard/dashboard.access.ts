import type { NextFunction, Request, Response } from "express";
import type { Queryable } from "../../config/pg.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import { authDeps } from "../auth/auth.middleware.js";
import type { Role, SignedInDto } from "../auth/auth.service.js";

/**
 * Who may do what in the dashboard: the role table admins change on the users screen
 * (role_permissions), enforced here. Spec: docs/superpowers/specs/2026-11-02-dashboard-data-design.md, section 5.
 */

/** The table's rows, in the users screen's order. */
export const PERMISSION_AREAS = ["leads", "customers", "passports", "greetings", "import", "users"] as const;
export const ACCESS_LEVELS = ["full", "view", "none"] as const;
export const ROLES = ["admin", "office", "sales"] as const satisfies readonly Role[];

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export interface PermissionRowDto {
  area: PermissionArea;
  access: Record<Role, AccessLevel>;
  /** The roles whose cell in this row can't be changed. */
  fixed: Role[];
}

/** Cells that stay as they are: admins have full access everywhere, sales never see passports, and only admins manage users. */
export function isFixed(role: Role, area: PermissionArea): boolean {
  return role === "admin" || area === "users" || (role === "sales" && area === "passports");
}

/** The role table as it stands. A row missing from role_permissions reads as no access. */
export async function permissionTable(db: Queryable): Promise<PermissionRowDto[]> {
  const { rows } = await db.query<{ role: Role; area: PermissionArea; access: AccessLevel }>("SELECT role, area, access FROM role_permissions");
  const level = (role: Role, area: PermissionArea): AccessLevel =>
    role === "admin" ? "full" : (rows.find((row) => row.role === role && row.area === area)?.access ?? "none");
  return PERMISSION_AREAS.map((area) => ({
    area,
    access: { admin: level("admin", area), office: level("office", area), sales: level("sales", area) },
    fixed: ROLES.filter((role) => isFixed(role, area)),
  }));
}

/** The signed-in person's level in each area. */
export type StaffAccess = Record<PermissionArea, AccessLevel>;

declare global {
  namespace Express {
    interface Request {
      /** Set by loadAccess: the signed-in person's level in each area. */
      access?: StaffAccess;
    }
  }
}

/** Their role's row in each area. Passports also need their own passport access. */
export function accessFor(table: readonly PermissionRowDto[], staff: SignedInDto): StaffAccess {
  const access = Object.fromEntries(table.map((row) => [row.area, row.access[staff.user.role]])) as StaffAccess;
  if (!staff.user.passportAccess) access.passports = "none";
  return access;
}

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, full: 2 };

/** Who's signed in; requireStaff runs before every dashboard route. */
export function staffOf(req: Request): SignedInDto {
  if (!req.staff) throw new UnauthorizedError();
  return req.staff;
}

/** Reads the role table once per request, after requireStaff, so a change applies from the next request. */
export async function loadAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  req.access = accessFor(await permissionTable(authDeps(res).db), staffOf(req));
  next();
}

export function can(req: Request, area: PermissionArea, level: "view" | "full"): boolean {
  if (!req.access) throw new UnauthorizedError();
  return RANK[req.access[area]] >= RANK[level];
}

export function noAccess(): AppError {
  return new AppError(403, "Your account doesn't have access to this", "NO_ACCESS");
}

/** Lets the request through only at `level` or above in `area`. */
export function requireAccess(area: PermissionArea, level: "view" | "full") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!can(req, area, level)) throw noAccess();
    next();
  };
}
