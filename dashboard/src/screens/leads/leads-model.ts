import type { Locale } from "../../content/copy";
import type { Group, Lead, LeadStatus } from "../../data/types";
import { dayAt } from "../../lib/clock";
import { formatDayMonth } from "../../lib/format";
import type { StatusTone } from "../../ui/StatusTag";

/** The pipeline in order: the detail's status chips and the board's columns. */
export const STATUS_ORDER: readonly LeadStatus[] = ["new", "talking", "details-sent", "registered", "not-relevant"];

/** Each status's dot on a StatusTag. */
export const STATUS_TONE: Record<LeadStatus, StatusTone> = {
  new: "new",
  talking: "talking",
  "details-sent": "sent",
  registered: "registered",
  "not-relevant": "irrelevant",
};

/** The same dots as plain spans, for the board's column headings. */
export const STATUS_DOT: Record<LeadStatus, string> = {
  new: "bg-status-new",
  talking: "bg-status-talking",
  "details-sent": "bg-status-sent",
  registered: "bg-status-registered",
  "not-relevant": "bg-status-irrelevant",
};

/** Leads of one trip. `group` is null for leads with no trip (or one that is no longer listed). */
export interface TripLeads<G extends Group = Group> {
  key: string;
  group: G | null;
  leads: Lead[];
}

const NO_TRIP = "no-trip";

/**
 * Leads grouped by trip. The list comes newest update first, so trips follow their latest activity, as on the board
 * (פולין, then אומן, then the challah evening). Leads without a known trip come last.
 */
export function groupByTrip<G extends Group>(leads: Lead[], groups: G[]): TripLeads<G>[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const trips = new Map<string, TripLeads<G>>();
  const loose: Lead[] = [];
  for (const lead of leads) {
    const group = lead.groupId ? byId.get(lead.groupId) : undefined;
    if (!group) {
      loose.push(lead);
      continue;
    }
    const trip = trips.get(group.id);
    if (trip) trip.leads.push(lead);
    else trips.set(group.id, { key: group.id, group, leads: [lead] });
  }
  const ordered = [...trips.values()];
  if (loose.length > 0) ordered.push({ key: NO_TRIP, group: null, leads: loose });
  return ordered;
}

/**
 * What follows a trip's name in the table: "יציאה 18.11" for a flight with dates, the stored label ("אוגוסט 2027")
 * while the dates are not fixed, and the day itself for an event ("03.12").
 */
export function tripWhen(group: Group, locale: Locale, departs: (date: string) => string): string {
  const start = formatDayMonth(dayAt(group.startsOn), locale);
  if (group.type === "event") return start;
  return group.dateLabel ?? departs(start);
}

/** The letter in a person's avatar: "י" for יעל פרץ. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "";
}

/** Staff are named by first name on these screens, as on the board: "רונית", "מורן". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "0542212219" becomes "972542212219". */
function internationalNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
}

export const whatsappHref = (phone: string): string => `https://wa.me/${internationalNumber(phone)}`;
export const telHref = (phone: string): string => `tel:+${internationalNumber(phone)}`;

/** After the side panel closes, focus goes back to the lead's link in the table or on the board. */
export function focusLeadLink(id: string): void {
  window.requestAnimationFrame(() => {
    const path = `/leads/${encodeURIComponent(id)}`;
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("main a[href]"));
    links.find((link) => link.pathname === path)?.focus();
  });
}
