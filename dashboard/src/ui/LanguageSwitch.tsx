import { motion } from "motion/react";
import { languageNames, LOCALES } from "../content/copy";
import { useCopy, useLocale } from "../content/locale";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { Segmented } from "./Segmented";

/**
 * Switches the app between Hebrew and English. Each language is named in itself.
 * Compact is one round button with the other language, for the phone's top bar.
 */
export function LanguageSwitch({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { locale, setLocale } = useLocale();
  const { common } = useCopy();

  if (compact) {
    const other = locale === "he" ? "en" : "he";
    return (
      <motion.button
        type="button"
        lang={other}
        aria-label={languageNames[other].full}
        onClick={() => setLocale(other)}
        whileTap={{ scale: PRESS_SCALE }}
        transition={springs.ui}
        className={cx("surface-glass grid size-12 shrink-0 place-items-center rounded-full text-[14px] font-medium text-ink transition-colors hover:bg-white", className)}
      >
        {languageNames[other].short}
      </motion.button>
    );
  }

  return (
    <Segmented
      id="language"
      label={common.language}
      value={locale}
      onChange={setLocale}
      options={LOCALES.map((value) => ({ value, label: languageNames[value].short, lang: value, ariaLabel: languageNames[value].full }))}
      className={className}
    />
  );
}
