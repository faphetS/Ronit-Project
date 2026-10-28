import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { COPY, directionOf, LOCALES, type Locale } from "./copy";
import { LocaleContext } from "./locale";

const STORAGE_KEY = "or-hatzadik:locale";

function storedLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return LOCALES.find((locale) => locale === stored) ?? "he";
  } catch {
    return "he";
  }
}

/** The chosen language: remembered on this device, and set on the page as its language, direction and title. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(storedLocale);

  // Before paint, so a remembered English never flashes right to left.
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
    document.title = COPY[locale].common.appTitle;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Storage can be blocked, as in some private windows. The choice then lasts until the page closes.
    }
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext value={value}>{children}</LocaleContext>;
}
