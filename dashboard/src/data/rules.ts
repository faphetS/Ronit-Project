import { daysBetween } from "../lib/clock";
import type { AccessLevel, Audience, Customer, Lead, PermissionMatrix, SendRate, StaffAccess, StaffUser } from "./types";

/**
 * The signed-in person's level in each area, as the server enforces it: their role's row in the role table, and
 * passports only with their own passport access.
 */
export function accessFor(matrix: PermissionMatrix, user: Pick<StaffUser, "role" | "passportAccess">): StaffAccess {
  const access = Object.fromEntries(matrix.map((row) => [row.area, row.access[user.role]])) as StaffAccess;
  if (!user.passportAccess) access.passports = "none";
  return access;
}

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, full: 2 };

export function atLeast(level: AccessLevel, needed: "view" | "full"): boolean {
  return RANK[level] >= RANK[needed];
}

/** Passports that expire within this many days (about six months) are flagged. */
export const EXPIRING_WITHIN_DAYS = 183;

/** The pipeline: leads that are not archived and not marked irrelevant. */
export function isOpenLead(lead: Lead): boolean {
  return !lead.archived && lead.status !== "not-relevant";
}

/** A passport expiring (YYYY-MM-DD) within EXPIRING_WITHIN_DAYS of `reference` is flagged as expiring soon. */
export function passportExpiresSoon(expiryDate: string, reference: Date): boolean {
  return daysBetween(reference, new Date(expiryDate)) <= EXPIRING_WITHIN_DAYS;
}

/** Minutes to send to `recipients` at `rate`: 412 at 50 every 10 minutes takes 90. */
export function estimateSendMinutes(recipients: number, rate: SendRate): number {
  return Math.ceil(recipients / rate.messages) * rate.everyMinutes;
}

/** Whether a greeting to `audience` reaches the customer. */
export function inAudience(customer: Pick<Customer, "groupIds">, audience: Pick<Audience, "kind" | "groupIds">): boolean {
  return audience.kind === "all" || customer.groupIds.some((groupId) => audience.groupIds.includes(groupId));
}
