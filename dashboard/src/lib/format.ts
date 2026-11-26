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

/**
 * An Israeli phone number in groups that read aloud: "052-178-4972", "02-123-4567". "+972" and "972" become the
 * leading 0. Anything else (a foreign number, a typo) shows as it came.
 */
export function formatPhone(phone: string): string {
  const raw = phone.trim();
  let digits = raw.replace(/[\s\-().]/g, "");
  if (/^\+?972\d{8,9}$/.test(digits)) digits = `0${digits.replace(/^\+?972/, "")}`;
  if (/^0[57]\d{8}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (/^0[2-489]\d{7}$/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return raw;
}
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
