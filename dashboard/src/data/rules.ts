import { daysBetween } from "../lib/clock";
import type { Audience, Customer, Lead, SendRate } from "./types";

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
