import { COPY, type Locale } from "../content/copy";
import { TIME_ZONE, daysBetween } from "./clock";

// Numbers and times read the same in Hebrew and English.
const numberFormat = new Intl.NumberFormat("he-IL");
const timeFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function dateFormats(intlLocale: string, weekday: "long" | "short") {
  return {
    dayMonth: new Intl.DateTimeFormat(intlLocale, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" }),
    date: new Intl.DateTimeFormat(intlLocale, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }),
    weekday: new Intl.DateTimeFormat(intlLocale, { timeZone: TIME_ZONE, weekday }),
    weekdayLetter: new Intl.DateTimeFormat(intlLocale, { timeZone: TIME_ZONE, weekday: "narrow" }),
    monthYear: new Intl.DateTimeFormat(intlLocale, { timeZone: TIME_ZONE, month: "long", year: "numeric" }),
  };
}

// British English keeps the day before the month, as in Hebrew. Its weekday is short ("Wed") to fit where the Hebrew name fits.
const DATE_FORMATS: Record<Locale, ReturnType<typeof dateFormats>> = {
  he: dateFormats("he-IL", "long"),
  en: dateFormats("en-GB", "short"),
};

export const formatNumber = (value: number): string => numberFormat.format(value);
export const formatDayMonth = (date: Date, locale: Locale = "he"): string => DATE_FORMATS[locale].dayMonth.format(date);
export const formatDate = (date: Date, locale: Locale = "he"): string => DATE_FORMATS[locale].date.format(date);
export const formatTime = (date: Date): string => timeFormat.format(date);

/** The weekday name without the word "יום", e.g. "רביעי". In English the short name, e.g. "Wed". */
export function formatWeekday(date: Date, locale: Locale = "he"): string {
  return DATE_FORMATS[locale].weekday.format(date).replace(/^יום\s+/, "");
}

/** The weekday as one letter, e.g. "ד׳" or "W", under a day's bar. */
export const formatWeekdayLetter = (date: Date, locale: Locale = "he"): string => DATE_FORMATS[locale].weekdayLetter.format(date);

/** "נובמבר 2026", "November 2026". */
export const formatMonthYear = (date: Date, locale: Locale = "he"): string => DATE_FORMATS[locale].monthYear.format(date);

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
export function formatRelative(date: Date, reference: Date, locale: Locale = "he"): string {
  const { time } = COPY[locale];
  const minutes = Math.round((reference.getTime() - date.getTime()) / 60_000);
  const days = daysBetween(date, reference);
  if (days === 0 && minutes >= 0 && minutes < 60) return time.minutesAgo(Math.max(1, minutes));
  if (days === 0 && minutes >= 60 && minutes < 4 * 60) return time.hoursAgo(Math.round(minutes / 60));
  if (days === 0) return time.today(formatTime(date));
  if (days === 1) return time.yesterday;
  return formatDayMonth(date, locale);
}
