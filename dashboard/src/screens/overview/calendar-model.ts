import type { Copy, Locale } from "../../content/copy";
import type { GroupParticipant, GroupSummary } from "../../data/types";
import { addDays, dayAt, isoDay } from "../../lib/clock";
import { formatHebrewDate } from "../../lib/hebrew";
import { holidayOn } from "../../lib/holidays";

type CalendarCopy = Copy["overview"]["calendar"];

export type CalendarKind = "holiday" | "flight" | "event";

/** One thing on the overview's calendar: a challah booking, a flight leaving or coming back, or a holiday. No birthdays. */
export interface CalendarItem {
  key: string;
  /** YYYY-MM-DD, in Israel. */
  day: string;
  kind: CalendarKind;
  title: string;
  detail: string | null;
  /** Where it opens: the customer who booked, or the trip. Holidays open nothing. */
  to: string | null;
}

/** How far ahead "coming up" looks for holidays; at least two always fall within it. */
export const HOLIDAY_LOOKAHEAD_DAYS = 200;

/** On one day: holidays first, then flights, then bookings. */
const KIND_ORDER: Record<CalendarKind, number> = { holiday: 0, flight: 1, event: 2 };

export function byDay(a: CalendarItem, b: CalendarItem): number {
  return a.day.localeCompare(b.day) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title);
}

/** The challah month groups whose bookings the calendar reads: the shown month's (YYYY-MM), and every one not over by `today`. */
export function eventGroupsToRead(groups: readonly GroupSummary[], month: string, today: string): string[] {
  const first = `${month}-01`;
  const last = `${month}-31`;
  return groups
    .filter((group) => {
      if (group.type !== "event" || !group.startsOn) return false;
      const ends = group.endsOn ?? group.startsOn;
      return (group.startsOn <= last && ends >= first) || ends >= today;
    })
    .map((group) => group.id);
}

/** Each dated booking: what and where (Monday's "סוג האירוע · עיר"), and who booked it. */
export function bookingItems(participants: readonly GroupParticipant[], copy: CalendarCopy): CalendarItem[] {
  return participants.flatMap((person) =>
    person.eventOn
      ? [
          {
            key: `event-${person.id}`,
            day: person.eventOn,
            kind: "event" as const,
            title: person.note ?? copy.challahEvent,
            detail: `${person.firstName} ${person.lastName}`.trim() || null,
            to: `/customers/${person.customerId}`,
          },
        ]
      : [],
  );
}

/** A dated flight leaves on its first day and comes back on its last. */
export function flightItems(groups: readonly GroupSummary[], copy: CalendarCopy): CalendarItem[] {
  return groups.flatMap((group) => {
    if (group.type !== "flight" || !group.startsOn) return [];
    const to = `/groups/${group.id}`;
    const items: CalendarItem[] = [{ key: `out-${group.id}`, day: group.startsOn, kind: "flight", title: group.shortName, detail: copy.departs, to }];
    if (group.endsOn && group.endsOn !== group.startsOn) {
      items.push({ key: `back-${group.id}`, day: group.endsOn, kind: "flight", title: group.shortName, detail: copy.returns, to });
    }
    return items;
  });
}

/** The holidays (their first day) from `from` to `to`, both YYYY-MM-DD, with the Hebrew date. */
export function holidayItems(from: string, to: string, names: Copy["holidayNames"], locale: Locale): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (let date = dayAt(from); isoDay(date) <= to; date = addDays(date, 1)) {
    const key = holidayOn(date);
    if (!key) continue;
    const day = isoDay(date);
    items.push({ key: `holiday-${day}`, day, kind: "holiday", title: names[key], detail: formatHebrewDate(date, locale), to: null });
  }
  return items;
}

/** The items on each day, in order. */
export function itemsByDay(items: readonly CalendarItem[]): Map<string, CalendarItem[]> {
  const days = new Map<string, CalendarItem[]>();
  for (const item of [...items].sort(byDay)) days.set(item.day, [...(days.get(item.day) ?? []), item]);
  return days;
}

/** The kinds on a day, once each, for its dots. */
export function kindsOf(items: readonly CalendarItem[]): CalendarKind[] {
  return (Object.keys(KIND_ORDER) as CalendarKind[]).filter((kind) => items.some((item) => item.kind === kind));
}

/** The next `count` items from `today` (YYYY-MM-DD) on. */
export function comingUp(items: readonly CalendarItem[], today: string, count: number): CalendarItem[] {
  return items
    .filter((item) => item.day >= today)
    .sort(byDay)
    .slice(0, count);
}
