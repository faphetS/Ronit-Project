/**
 * Calendar days and wall-clock times in Israel, exact across daylight saving. Days are
 * YYYY-MM-DD strings; times are HH:mm. Mirrors the dashboard's src/data/mock/schedule.ts,
 * which shows Ronit the same send times.
 */

const ZONE = "Asia/Jerusalem";
const HOUR_MS = 3_600_000;

const dayParts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const wallClock = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The calendar day in Israel at that moment. */
export function israelDay(at: Date): string {
  const parts = Object.fromEntries(dayParts.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** A wall-clock time on a calendar day in Israel, as an instant. Israel is UTC+2 in winter, UTC+3 in summer. */
export function israelMoment(day: string, time: string): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  const winter = new Date(Date.UTC(year, month - 1, date, hours - 2, minutes));
  return wallClock.format(winter) === time ? winter : new Date(winter.getTime() - HOUR_MS);
}

export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** 0 is Sunday and 6 is Shabbat. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The birthday in `year` for a birth date. 29 February falls on the 28th in other years. */
export function birthdayIn(year: number, birthDate: string): string {
  const monthDay = birthDate.slice(5);
  return `${year}-${monthDay === "02-29" && !isLeapYear(year) ? "02-28" : monthDay}`;
}

export type ShabbatRule = "after-shabbat" | "before-shabbat";

/** Shabbat birthdays wait until Shabbat is out; by 21:00 it is, all year round. */
export const AFTER_SHABBAT_TIME = "21:00";

/** When the greeting for a birthday on `day` goes out. */
export function birthdaySlot(day: string, settings: { sendTime: string; shabbatRule: ShabbatRule }): Date {
  if (weekdayOf(day) !== 6) return israelMoment(day, settings.sendTime);
  if (settings.shabbatRule === "after-shabbat") return israelMoment(day, AFTER_SHABBAT_TIME);
  return israelMoment(addDays(day, -1), settings.sendTime);
}
