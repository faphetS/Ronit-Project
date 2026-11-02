import type { Copy, Locale } from "../../content/copy";
import { daysBetween, isoDay } from "../../lib/clock";
import { formatDate, formatDayMonth, formatTime } from "../../lib/format";

type WhenCopy = Copy["customersCopy"]["when"];

/** "24.10" within the year of `reference`, "24.10.2025" before it. */
export function shortDate(date: Date, reference: Date, locale: Locale): string {
  return isoDay(date).slice(0, 4) === isoDay(reference).slice(0, 4) ? formatDayMonth(date, locale) : formatDate(date, locale);
}

/** A logged moment: "היום 14:32", "אתמול 19:48", "03.10". For the access log, notes and intakes. */
export function momentLabel(date: Date, reference: Date, locale: Locale, when: WhenCopy): string {
  const days = daysBetween(date, reference);
  if (days === 0) return when.today(formatTime(date));
  if (days === 1) return when.yesterdayAt(formatTime(date));
  return shortDate(date, reference, locale);
}

/** A card's last update in the table: "היום 12:05", "אתמול", "26.10". */
export function updateLabel(date: Date, reference: Date, locale: Locale, when: WhenCopy): string {
  const days = daysBetween(date, reference);
  if (days === 0) return when.today(formatTime(date));
  if (days === 1) return when.yesterday;
  return shortDate(date, reference, locale);
}
