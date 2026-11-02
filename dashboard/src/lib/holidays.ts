import { addDays, daysBetween } from "./clock";
import { hebrewDateParts, sameHebrewMonth } from "./hebrew";

export type HolidayKey =
  | "roshHashana"
  | "yomKippur"
  | "sukkot"
  | "hanukkah"
  | "tuBishvat"
  | "purim"
  | "pesach"
  | "shavuot"
  | "tuBav";

interface HolidayRule {
  key: HolidayKey;
  months: string[];
  day: number;
}

// Hebrew-calendar dates of the holidays Ronit sends greetings for. Purim is in Adar II in leap years.
const RULES: HolidayRule[] = [
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

export interface UpcomingHoliday {
  key: HolidayKey;
  /** The holiday itself. */
  day: Date;
  /** The evening it starts; greetings go out then. */
  eve: Date;
  daysToEve: number;
}

/** The next holiday whose eve is today or later. */
export function nextHoliday(from: Date): UpcomingHoliday {
  for (let offset = 0; offset <= 400; offset += 1) {
    const day = addDays(from, offset);
    const { day: dayOfMonth, month } = hebrewDateParts(day);
    const rule = RULES.find((r) => r.day === dayOfMonth && r.months.some((m) => sameHebrewMonth(m, month)));
    if (!rule) continue;
    const eve = addDays(day, -1);
    const daysToEve = daysBetween(from, eve);
    if (daysToEve >= 0) return { key: rule.key, day, eve, daysToEve };
  }
  throw new Error("No holiday within 400 days");
}
