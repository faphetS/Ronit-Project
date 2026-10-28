import type { Locale } from "../content/copy";
import { TIME_ZONE } from "./clock";

const HUNDREDS: Array<[number, string]> = [[300, "ש"], [200, "ר"], [100, "ק"]];
const TENS: Array<[number, string]> = [[90, "צ"], [80, "פ"], [70, "ע"], [60, "ס"], [50, "נ"], [40, "מ"], [30, "ל"], [20, "כ"], [10, "י"]];
const ONES: Array<[number, string]> = [[9, "ט"], [8, "ח"], [7, "ז"], [6, "ו"], [5, "ה"], [4, "ד"], [3, "ג"], [2, "ב"], [1, "א"]];
const GERESH = "׳";
const GERSHAYIM = "״";

/** Hebrew numerals: 17 is "י״ז", 15 is "ט״ו", 5 is "ה׳", 787 is "תשפ״ז". */
export function toHebrewNumeral(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 999) {
    throw new RangeError(`Cannot write ${value} in Hebrew numerals`);
  }
  let rest = value;
  let letters = "";
  while (rest >= 400) {
    letters += "ת";
    rest -= 400;
  }
  for (const [amount, letter] of HUNDREDS) {
    if (rest >= amount) {
      letters += letter;
      rest -= amount;
      break;
    }
  }
  // 15 and 16 are written ט״ו and ט״ז so they never spell a divine name.
  if (rest === 15 || rest === 16) {
    letters += rest === 15 ? "טו" : "טז";
    rest = 0;
  }
  for (const [amount, letter] of TENS) {
    if (rest >= amount) {
      letters += letter;
      rest -= amount;
      break;
    }
  }
  for (const [amount, letter] of ONES) {
    if (rest >= amount) {
      letters += letter;
      break;
    }
  }
  return letters.length === 1 ? letters + GERESH : `${letters.slice(0, -1)}${GERSHAYIM}${letters.slice(-1)}`;
}

// Latin digits are forced so the day and year always parse as numbers.
const hebrewCalendar = new Intl.DateTimeFormat("he-IL-u-ca-hebrew-nu-latn", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

export interface HebrewDate {
  day: number;
  month: string;
  year: number;
}

export function hebrewDateParts(date: Date): HebrewDate {
  const parts = Object.fromEntries(hebrewCalendar.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: Number(parts.day), month: String(parts.month), year: Number(parts.year) };
}

// English month names come from ICU as well ("Heshvan", "Adar II").
const hebrewCalendarEnglish = new Intl.DateTimeFormat("en-GB-u-ca-hebrew", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** 2026-10-28 becomes "י״ז בחשוון תשפ״ז", or "17 Heshvan 5787" in English. */
export function formatHebrewDate(date: Date, locale: Locale = "he"): string {
  if (locale === "en") {
    const { day, month, year } = Object.fromEntries(hebrewCalendarEnglish.formatToParts(date).map((part) => [part.type, part.value]));
    return [day, month, year].join(" ");
  }
  const { day, month, year } = hebrewDateParts(date);
  return `${toHebrewNumeral(day)} ב${month} ${toHebrewNumeral(year % 1000)}`;
}

/** Compares month names across spellings ("חשון" and "חשוון", "אדר ב׳" and "אדר ב'"). */
export function sameHebrewMonth(a: string, b: string): boolean {
  const normalize = (month: string) => month.replace(/[וי׳'״"\s]/g, "");
  return normalize(a) === normalize(b);
}
