export const TIME_ZONE = "Asia/Jerusalem";

const DAY_MS = 86_400_000;

const isoDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day of `date` in Israel, as YYYY-MM-DD. */
export function isoDay(date: Date): string {
  return isoDayFormat.format(date);
}

/**
 * A moment on a calendar day in Israel. The +02:00 offset is exact in winter;
 * in summer the clock time is an hour off, but the calendar day is always right.
 */
export function dayAt(day: string, time = "12:00"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Expected YYYY-MM-DD, got "${day}"`);
  return new Date(`${day}T${time}:00+02:00`);
}

/** Today in Israel, at noon. */
export function today(): Date {
  return dayAt(isoDay(new Date()));
}

/** This moment. Tests fix it with vi.setSystemTime (src/test/setup.ts). */
export function now(): Date {
  return new Date();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function utcMidnight(date: Date): number {
  const [year, month, day] = isoDay(date).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Whole calendar days from `from` to `to`, counted in Israel time. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

/** The Sunday that starts the week containing `date` (Israeli weeks start on Sunday). */
export function weekStart(date: Date): Date {
  const weekday = new Date(utcMidnight(date)).getUTCDay();
  return dayAt(isoDay(addDays(date, -weekday)));
}

/** A month's days (YYYY-MM-DD) for a calendar whose weeks start on Sunday: null for the blanks before the 1st. `month` is YYYY-MM. */
export function monthDays(month: string): Array<string | null> {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  ];
}

/** The month (YYYY-MM) `months` months after `month`; negative goes back. */
export function shiftMonth(month: string, months: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
