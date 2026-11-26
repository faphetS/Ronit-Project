import type { ReactNode } from "react";
import { languageNames, LOCALES } from "../../content/copy";
import { useLocale } from "../../content/locale";
import { cx } from "../../lib/cx";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { HAIRLINE } from "./settings-rows";

/** A row's icon on a small sand tile, or a warm red one for signing out. */
export function Tile({ icon, warning = false }: { icon: IconName; warning?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid size-8 shrink-0 place-items-center rounded-[10px]",
        warning ? "bg-status-warning/10 text-status-warning" : "bg-sand-light text-ink ring-1 ring-black/[0.04] ring-inset",
      )}
    >
      <Icon name={icon} size={17} />
    </span>
  );
}

export function Chevron() {
  return <Icon name="forward" size={14} className="shrink-0 text-mute/50" />;
}

/** One group of rows on a white card. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="overflow-clip rounded-[20px] bg-white/90 ring-1 ring-black/[0.04]">{children}</div>;
}

interface RowBodyProps {
  icon: IconName;
  label: string;
  value?: ReactNode;
  trailing?: ReactNode;
  first?: boolean;
  warning?: boolean;
}

/** A row's insides: the tile, then the label and what trails it, over a hairline that starts at the label. */
export function RowBody({ icon, label, value, trailing, first = false, warning = false }: RowBodyProps) {
  return (
    <>
      <Tile icon={icon} warning={warning} />
      <span className={cx("flex min-h-12 min-w-0 flex-1 items-center gap-2 pe-3.5", !first && HAIRLINE)}>
        <span className={cx("min-w-0 flex-1 truncate text-start text-[14.5px]", warning ? "text-status-warning" : "text-ink")}>{label}</span>
        {value === undefined ? null : <span className="shrink-0 text-[14px] text-mute">{value}</span>}
        {trailing}
      </span>
    </>
  );
}

/** The two languages as a small segmented control: the language row of the settings, on desktop and phones. */
export function LanguageToggle({ label }: { label: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div role="group" aria-label={label} className="flex shrink-0 rounded-full bg-sand-light p-0.5 ring-1 ring-black/[0.04] ring-inset">
      {LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={locale === value}
          aria-label={languageNames[value].full}
          onClick={() => setLocale(value)}
          className={cx(
            "h-8 min-w-11 rounded-full px-2.5 text-[13px] font-medium transition-colors",
            locale === value ? "bg-ink text-cream" : "text-mute hover:text-ink",
          )}
        >
          {languageNames[value].short}
        </button>
      ))}
    </div>
  );
}
