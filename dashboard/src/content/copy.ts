import { common as commonEn } from "./common.en";
import { common as commonHe } from "./common.he";
import { holidayCountdown as holidayCountdownEn, holidayNames as holidayNamesEn } from "./holidays.en";
import { holidayCountdown as holidayCountdownHe, holidayNames as holidayNamesHe } from "./holidays.he";
import { leadsCopy as leadsEn } from "./leads.en";
import { leadsCopy as leadsHe } from "./leads.he";
import { nav as navEn } from "./nav.en";
import { nav as navHe } from "./nav.he";
import { overview as overviewEn } from "./overview.en";
import { overview as overviewHe } from "./overview.he";
import { comingSoon as comingSoonEn, screens as screensEn } from "./screens.en";
import { comingSoon as comingSoonHe, screens as screensHe } from "./screens.he";
import { signIn as signInEn } from "./signIn.en";
import { signIn as signInHe } from "./signIn.he";
import { states as statesEn } from "./states.en";
import { states as statesHe } from "./states.he";
import { time as timeEn } from "./time.en";
import { time as timeHe } from "./time.he";
import type { Widen } from "./types";

export type Locale = "he" | "en";

export const LOCALES: readonly Locale[] = ["he", "en"];

/** Hebrew reads right to left, English left to right. */
export function directionOf(locale: Locale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}

/** Each language named in itself, the way a language switch shows it. */
export const languageNames: Record<Locale, { short: string; full: string }> = {
  he: { short: "עב", full: "עברית" },
  en: { short: "EN", full: "English" },
};

const he = {
  common: commonHe,
  holidayNames: holidayNamesHe,
  holidayCountdown: holidayCountdownHe,
  leadsCopy: leadsHe,
  nav: navHe,
  overview: overviewHe,
  screens: screensHe,
  comingSoon: comingSoonHe,
  signIn: signInHe,
  states: statesHe,
  time: timeHe,
};

/** All interface copy in one language. Each *.en.ts file has the shape of its *.he.ts twin. */
export type Copy = Widen<typeof he>;

const en: Copy = {
  common: commonEn,
  holidayNames: holidayNamesEn,
  holidayCountdown: holidayCountdownEn,
  leadsCopy: leadsEn,
  nav: navEn,
  overview: overviewEn,
  screens: screensEn,
  comingSoon: comingSoonEn,
  signIn: signInEn,
  states: statesEn,
  time: timeEn,
};

export const COPY: Record<Locale, Copy> = { he, en };
