import { createContext, useContext } from "react";
import { COPY, directionOf, type Copy, type Locale } from "./copy";

export interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** Hebrew unless a LocaleProvider says otherwise, so components also render on their own, as in tests. */
export const LocaleContext = createContext<LocaleState>({ locale: "he", setLocale: () => {} });

export function useLocale(): LocaleState {
  return useContext(LocaleContext);
}

/** The interface copy in the chosen language. */
export function useCopy(): Copy {
  return COPY[useLocale().locale];
}

/** "rtl" in Hebrew, "ltr" in English: for motion that moves sideways. */
export function useDirection(): "rtl" | "ltr" {
  return directionOf(useLocale().locale);
}
