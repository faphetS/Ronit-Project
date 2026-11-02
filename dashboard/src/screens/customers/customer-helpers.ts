import { passportExpiresSoon } from "../../data/rules";
import type { CustomerFilter } from "../../data/services";
import type { Customer, GroupSummary, Passport, PassportIntake } from "../../data/types";
import { dayAt, daysBetween, isoDay } from "../../lib/clock";

/** The filter chips, in board order. */
export const CUSTOMER_FILTERS: readonly CustomerFilter[] = ["all", "whatsapp-today", "expiring", "missing-passport"];

/** The customer list pages at 25 rows (spec section 8). */
export const PAGE_SIZE = 25;

/** ?filter= from the address. The rail's WhatsApp tool links to ?filter=whatsapp, which means today's WhatsApp passports. */
export function filterFromParam(value: string | null): CustomerFilter {
  if (value === "whatsapp") return "whatsapp-today";
  return CUSTOMER_FILTERS.find((filter) => filter === value) ?? "all";
}

/** ?page= from the address: a whole number from 1. */
export function pageFromParam(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? page : 1;
}

export function fullName(person: Pick<Customer, "firstName" | "lastName">): string {
  return `${person.firstName} ${person.lastName}`;
}

/** The letter in a person's avatar. */
export function initialOf(name: string): string {
  return name.trim().charAt(0);
}

/** A calendar day stored as YYYY-MM-DD, as a moment that formats to that same day in Israel. */
export function calendarDay(day: string): Date {
  return dayAt(day);
}

/** The year of a YYYY-MM-DD day, or of an ISO moment in Israel. */
export function yearOf(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 4) : isoDay(new Date(value)).slice(0, 4);
}

export type PassportState = "valid" | "expiring" | "expired" | "missing";

/** Where a passport stands on `reference`: missing, expired, expiring within the flag window, or valid. */
export function passportState(passport: Passport | null, reference: Date): PassportState {
  if (!passport) return "missing";
  if (daysBetween(reference, calendarDay(passport.expiryDate)) < 0) return "expired";
  return passportExpiresSoon(passport.expiryDate, reference) ? "expiring" : "valid";
}

/** The group names a customer belongs to, by their short names. Empty while the groups are loading. */
export function groupNames(groupIds: readonly string[], groups: readonly GroupSummary[] | undefined): string[] {
  if (!groups) return [];
  return groupIds.flatMap((id) => {
    const group = groups.find((candidate) => candidate.id === id);
    return group ? [group.shortName] : [];
  });
}

/** Whether `date` falls on the same calendar day as `reference`, in Israel. */
export function sameDay(date: Date, reference: Date): boolean {
  return isoDay(date) === isoDay(reference);
}

/** The passport arrived on WhatsApp on `reference`'s day. */
export function arrivedOnWhatsappOn(passport: Passport | null, reference: Date): passport is Passport {
  return passport !== null && passport.receivedVia === "whatsapp" && sameDay(new Date(passport.receivedAt), reference);
}

/** WhatsApp passports that came in on `reference`'s day. */
export function intakesOn(intakes: readonly PassportIntake[], reference: Date): PassportIntake[] {
  return intakes.filter((intake) => sameDay(new Date(intake.receivedAt), reference));
}

/** The latest WhatsApp intake that landed on this customer's card (intakes come newest first). */
export function intakeFor(customerId: string, intakes: readonly PassportIntake[] | undefined): PassportIntake | undefined {
  return intakes?.find((intake) => intake.customerId === customerId);
}

/** "0526120418" becomes "972526120418", the international form links need. */
function internationalNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
}

/** Opens a WhatsApp chat with the number. */
export function whatsappHref(phone: string): string {
  return `https://wa.me/${internationalNumber(phone)}`;
}

export function telHref(phone: string): string {
  return `tel:+${internationalNumber(phone)}`;
}

/** Staff are named by their first name in lists and logs: "רונית" for רונית ברש, as on the boards. */
export function staffFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
