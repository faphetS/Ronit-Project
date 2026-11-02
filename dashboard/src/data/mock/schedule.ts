import { TIME_ZONE, addDays, dayAt, isoDay } from "../../lib/clock";
import type { BirthdaySettings } from "../types";

const HOUR_MS = 3_600_000;
const wallClock = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** A wall-clock time (HH:mm) on a calendar day (YYYY-MM-DD) in Israel. Unlike dayAt, it is exact in summer too. */
export function israelMoment(day: string, time: string): Date {
  const winter = dayAt(day, time);
  return wallClock.format(winter) === time ? winter : new Date(winter.getTime() - HOUR_MS);
}

/** 0 is Sunday and 6 is Shabbat. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The birthday in `year` for a birth date, YYYY-MM-DD. 29 February falls on the 28th in other years. */
export function birthdayIn(year: number, birthDate: string): string {
  const monthDay = birthDate.slice(5);
  return `${year}-${monthDay === "02-29" && !isLeapYear(year) ? "02-28" : monthDay}`;
}

/** Shabbat birthdays wait until Shabbat is out; by 21:00 it is, all year round. */
export const AFTER_SHABBAT_TIME = "21:00";

export interface BirthdaySlot {
  sendAt: string;
  onShabbat: boolean;
}

/** When the greeting for a birthday on `day` goes out under the settings. */
export function birthdaySlot(day: string, settings: Pick<BirthdaySettings, "sendTime" | "shabbatRule">): BirthdaySlot {
  const onShabbat = weekdayOf(day) === 6;
  if (!onShabbat) return { sendAt: israelMoment(day, settings.sendTime).toISOString(), onShabbat };
  if (settings.shabbatRule === "after-shabbat") return { sendAt: israelMoment(day, AFTER_SHABBAT_TIME).toISOString(), onShabbat };
  const friday = isoDay(addDays(dayAt(day), -1));
  return { sendAt: israelMoment(friday, settings.sendTime).toISOString(), onShabbat };
}
