import { addDays, israelMoment, weekdayOf } from "./israel-time.js";

/**
 * The holidays Ronit sends greetings for, on the Hebrew calendar that ships with Node (ICU), and
 * when each greeting goes out. The dashboard keeps the same rules (dashboard/src/lib/holidays.ts).
 */

export type HolidayKey = "roshHashana" | "yomKippur" | "sukkot" | "hanukkah" | "tuBishvat" | "purim" | "pesach" | "shavuot" | "tuBav";

// Purim is in Adar II in leap years, when ICU names the months "אדר א׳" and "אדר ב׳".
const RULES: ReadonlyArray<{ key: HolidayKey; months: readonly string[]; day: number }> = [
  { key: "roshHashana", months: ["תשרי"], day: 1 },
  { key: "yomKippur", months: ["תשרי"], day: 10 },
  { key: "sukkot", months: ["תשרי"], day: 15 },
  { key: "hanukkah", months: ["כסלו"], day: 25 },
  { key: "tuBishvat", months: ["שבט"], day: 15 },
  { key: "purim", months: ["אדר", "אדר ב׳"], day: 14 },
  { key: "pesach", months: ["ניסן"], day: 15 },
  { key: "shavuot", months: ["סיוון"], day: 6 },
  { key: "tuBav", months: ["אב"], day: 15 },
];

// Latin digits, so the day and year parse as numbers.
const hebrewCalendar = new Intl.DateTimeFormat("he-IL-u-ca-hebrew-nu-latn", {
  timeZone: "Asia/Jerusalem",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Month names across spellings ("חשון" and "חשוון", "אדר ב׳" and "אדר ב'"). */
const normalizeMonth = (month: string) => month.replace(/[וי׳'״"\s]/g, "");

function hebrewDate(day: string): { day: number; month: string; year: number } {
  // Noon UTC is the same calendar day in Israel all year.
  const parts = Object.fromEntries(hebrewCalendar.formatToParts(new Date(`${day}T12:00:00Z`)).map((part) => [part.type, part.value]));
  return { day: Number(parts.day), month: String(parts.month), year: Number(parts.year) };
}

export interface UpcomingHoliday {
  key: HolidayKey;
  /** The Hebrew year of the holiday itself: 5787 for Hanukkah in December 2026. */
  hebrewYear: number;
  /** YYYY-MM-DD in Israel. */
  day: string;
  /** The day before, when the holiday starts at sundown and the greeting goes out. */
  eve: string;
}

/** The holidays whose eve is `from` or later, in order, for a little over a year. */
export function upcomingHolidays(from: string, days = 400): UpcomingHoliday[] {
  const found: UpcomingHoliday[] = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const day = addDays(from, offset);
    const date = hebrewDate(day);
    const rule = RULES.find((r) => r.day === date.day && r.months.some((month) => normalizeMonth(month) === normalizeMonth(date.month)));
    if (rule) found.push({ key: rule.key, hebrewYear: date.year, day, eve: addDays(day, -1) });
  }
  return found;
}

/** Holiday greetings go out at noon on the eve: well before candle lighting in every season. */
export const HOLIDAY_SEND_TIME = "12:00";

/**
 * When the greeting for a holiday goes out: noon on the eve, or noon on Friday when the eve is
 * Shabbat (the holiday then starts as Shabbat ends, so nothing goes out on Shabbat).
 */
export function holidaySendAt(eve: string): Date {
  const day = weekdayOf(eve) === 6 ? addDays(eve, -1) : eve;
  return israelMoment(day, HOLIDAY_SEND_TIME);
}
