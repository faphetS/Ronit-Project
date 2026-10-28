export const TIME_ZONE = "Asia/Jerusalem";

const DEFAULT_DAY = "2026-10-28";
const DEMO_TIME = "15:30";
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

function demoDay(): string {
  return import.meta.env.VITE_DEMO_TODAY || DEFAULT_DAY;
}

/** The demo "today", at noon. Mock data is built around this day. */
export function today(): Date {
  return dayAt(demoDay());
}

/** The demo "now": the demo day at 15:30 Israel time. */
export function now(): Date {
  return dayAt(demoDay(), DEMO_TIME);
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
