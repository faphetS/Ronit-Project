import type { Lead } from "./types";

/** Passports that expire within this many days (about six months) are flagged. */
export const EXPIRING_WITHIN_DAYS = 183;

/** The pipeline: leads that are not archived and not marked irrelevant. */
export function isOpenLead(lead: Lead): boolean {
  return !lead.archived && lead.status !== "not-relevant";
}
