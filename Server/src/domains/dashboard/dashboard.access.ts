import type { NextFunction, Request, Response } from "express";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import type { Role, SignedInDto } from "../auth/auth.service.js";

/**
 * Who may do what in the dashboard. The users screen shows this same table; here it's enforced.
 * Spec: docs/superpowers/specs/2026-11-02-dashboard-data-design.md, section 5.
 */

export type PermissionArea = "leads" | "customers" | "passports" | "greetings" | "import" | "users";
export type AccessLevel = "full" | "view" | "none";

export const PERMISSIONS: ReadonlyArray<{ area: PermissionArea; access: Readonly<Record<Role, AccessLevel>> }> = [
  { area: "leads", access: { admin: "full", office: "full", sales: "full" } },
  { area: "customers", access: { admin: "full", office: "full", sales: "view" } },
  { area: "passports", access: { admin: "full", office: "full", sales: "none" } },
  { area: "greetings", access: { admin: "full", office: "full", sales: "none" } },
  { area: "import", access: { admin: "full", office: "none", sales: "none" } },
  { area: "users", access: { admin: "full", office: "none", sales: "none" } },
];

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, full: 2 };

/** The person's level in an area. Passports also need their own passport access. */
export function accessTo(staff: SignedInDto, area: PermissionArea): AccessLevel {
  const level = PERMISSIONS.find((row) => row.area === area)?.access[staff.user.role] ?? "none";
  if (area === "passports" && !staff.user.passportAccess) return "none";
  return level;
}

export function can(staff: SignedInDto, area: PermissionArea, level: "view" | "full"): boolean {
  return RANK[accessTo(staff, area)] >= RANK[level];
}

/** Who's signed in; requireStaff runs before every dashboard route. */
export function staffOf(req: Request): SignedInDto {
  if (!req.staff) throw new UnauthorizedError();
  return req.staff;
}

export function noAccess(): AppError {
  return new AppError(403, "Your account doesn't have access to this", "NO_ACCESS");
}

/** Lets the request through only at `level` or above in `area`. */
export function requireAccess(area: PermissionArea, level: "view" | "full") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!can(staffOf(req), area, level)) throw noAccess();
    next();
  };
}
