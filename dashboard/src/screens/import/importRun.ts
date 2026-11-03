import type { Copy, Locale } from "../../content/copy";
import { addDays, isoDay, now } from "../../lib/clock";
import { formatRelative, formatTime } from "../../lib/format";

type ImportCopy = Copy["importCopy"];

/** When a copy ran or will run: "היום ב-13:00", "מחר ב-07:00", or older days as the dashboard writes them. */
export function whenText(at: string, copy: ImportCopy, locale: Locale): string {
  const date = new Date(at);
  const reference = now();
  if (isoDay(date) === isoDay(reference)) return copy.schedule.todayAt(formatTime(date));
  if (isoDay(date) === isoDay(addDays(reference, 1))) return copy.schedule.tomorrowAt(formatTime(date));
  return formatRelative(date, reference, locale);
}
