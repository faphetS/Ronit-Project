import { time } from "../content/time.he";
import { TIME_ZONE, daysBetween } from "./clock";

const numberFormat = new Intl.NumberFormat("he-IL");
const dayMonthFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, weekday: "long" });

export const formatNumber = (value: number): string => numberFormat.format(value);
export const formatDayMonth = (date: Date): string => dayMonthFormat.format(date);
export const formatDate = (date: Date): string => dateFormat.format(date);
export const formatTime = (date: Date): string => timeFormat.format(date);

/** The weekday name without the word "יום", e.g. "רביעי". */
export function formatWeekday(date: Date): string {
  return weekdayFormat.format(date).replace(/^יום\s+/, "");
}

/** "0542212219" becomes "054-•••-2219". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length < 7 ? digits : `${digits.slice(0, 3)}-•••-${digits.slice(-4)}`;
}

/** "38412921" becomes "38•••921". */
export function maskPassport(passport: string): string {
  return passport.length < 6 ? "•••" : `${passport.slice(0, 2)}•••${passport.slice(-3)}`;
}

/** Short relative time as the dashboard shows it: "לפני שעה", "היום 09:12", "אתמול", "24.10". */
export function formatRelative(date: Date, reference: Date): string {
  const minutes = Math.round((reference.getTime() - date.getTime()) / 60_000);
  const days = daysBetween(date, reference);
  if (days === 0 && minutes >= 0 && minutes < 60) return time.minutesAgo(Math.max(1, minutes));
  if (days === 0 && minutes >= 60 && minutes < 4 * 60) return time.hoursAgo(Math.round(minutes / 60));
  if (days === 0) return time.today(formatTime(date));
  if (days === 1) return time.yesterday;
  return formatDayMonth(date);
}
