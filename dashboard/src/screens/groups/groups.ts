import type { Copy, Locale } from "../../content/copy";
import type { GroupParticipant, GroupSummary } from "../../data/types";
import { TIME_ZONE, dayAt } from "../../lib/clock";
import { formatDate, formatDayMonth } from "../../lib/format";

type GroupsCopy = Copy["groupsCopy"];

/** Ids of the sections the orb cards scroll to. */
export const PARTICIPANTS_SECTION = "group-participants";
export const MISSING_SECTION = "group-missing-passports";

/** The group in the address, or the first one (by start date) when the address names none. */
export function selectGroup(groups: GroupSummary[], groupId: string | undefined): GroupSummary | undefined {
  return groupId === undefined ? groups[0] : groups.find((group) => group.id === groupId);
}

export function totalRegistered(groups: GroupSummary[]): number {
  return groups.reduce((sum, group) => sum + group.registered, 0);
}

/** "פולין · נובמבר" becomes "פולין נובמבר", for a name inside a longer title. */
export function plainName(name: string): string {
  return name.replace(/\s*·\s*/g, " ");
}

export function fullName(person: Pick<GroupParticipant, "firstName" | "lastName">): string {
  return `${person.firstName} ${person.lastName}`;
}

/** The share of places taken, 0 to 1. */
export function fillShare(group: GroupSummary): number {
  return group.capacity > 0 ? group.registered / group.capacity : 0;
}

export function seatsFree(group: GroupSummary): number {
  return Math.max(0, group.capacity - group.registered);
}

// The office's date label ("אוגוסט 2027") is Hebrew text; English shows the month and year of the start date instead.
const englishMonthYear = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, month: "long", year: "numeric" });

/** When the group starts: "18.11.2026" (or "18.11" without the year), or the label while the date is not fixed. */
export function groupDate(group: GroupSummary, locale: Locale, withYear = true): string {
  if (group.dateLabel) return locale === "he" ? group.dateLabel : englishMonthYear.format(dayAt(group.startsOn));
  const start = dayAt(group.startsOn);
  return withYear ? formatDate(start, locale) : formatDayMonth(start, locale);
}

/** "18.11 עד 22.11" for a trip with an end date, otherwise when it starts. */
function datesText(group: GroupSummary, copy: GroupsCopy, locale: Locale): string {
  if (group.endsOn && !group.dateLabel) {
    return copy.dateRange(formatDayMonth(dayAt(group.startsOn), locale), formatDayMonth(dayAt(group.endsOn), locale));
  }
  return groupDate(group, locale, false);
}

/** The tag on a desktop card: "טיסה", "טיסה · נשים בלבד". */
export function groupTag(group: GroupSummary, copy: GroupsCopy): string {
  return [copy.kind[group.type], group.womenOnly ? copy.womenOnly : null].filter(Boolean).join(copy.sep);
}

/** The line under a desktop card's meter: "יציאה 18.11.2026", or "תאריך 03.12.2026" for an event. */
export function groupWhen(group: GroupSummary, copy: GroupsCopy, locale: Locale): string {
  const date = groupDate(group, locale);
  return group.type === "event" ? copy.onDate(date) : copy.departs(date);
}

/** The short date line beside an orb: "יציאה 18.11". */
export function groupWhenShort(group: GroupSummary, copy: GroupsCopy, locale: Locale): string {
  const date = groupDate(group, locale, false);
  return group.type === "event" ? copy.onDate(date) : copy.departs(date);
}

/** The tag on the selected phone card: "טיסה · 18.11 עד 22.11". */
export function phoneTag(group: GroupSummary, copy: GroupsCopy, locale: Locale): string {
  return [copy.kind[group.type], group.womenOnly ? copy.womenOnly : null, datesText(group, copy, locale)].filter(Boolean).join(copy.sep);
}

/** The top line of a phone carousel card: "אירוע · 03.12", "טיסה · נשים בלבד", "טיסה · ספטמבר 2027". */
export function phoneCaption(group: GroupSummary, copy: GroupsCopy, locale: Locale): string {
  return [copy.kind[group.type], group.womenOnly ? copy.womenOnly : datesText(group, copy, locale)].join(copy.sep);
}

/** Brings a section into view and moves focus to it, smoothly unless Reduce Motion is on. */
export function revealSection(id: string, smooth: boolean): void {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  target.focus({ preventScroll: true });
}
