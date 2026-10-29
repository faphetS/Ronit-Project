import { useLocale } from "../../content/locale";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatWeekday } from "../../lib/format";
import { formatHebrewDate } from "../../lib/hebrew";
import { OrbCard } from "../../ui/OrbCard";

type TodayCardSize = "tall" | "regular" | "compact";

const LAYOUT: Record<TodayCardSize, { orb: { size: number; end: number; top: number }; stripBasis: string; dayClass: string }> = {
  tall: { orb: { size: 290, end: 28, top: 180 }, stripBasis: "55%", dayClass: "text-[76px] leading-none" },
  regular: { orb: { size: 180, end: 54, top: 60 }, stripBasis: "55%", dayClass: "text-display" },
  compact: { orb: { size: 170, end: 92, top: 40 }, stripBasis: "50%", dayClass: "text-[44px] leading-none" },
};

interface TodayCardProps {
  day: Date;
  label: string;
  size?: TodayCardSize;
  className?: string;
}

/** The orb card with the weekday, the date and the Hebrew date. */
export function TodayCard({ day, label, size = "regular", className }: TodayCardProps) {
  const layout = LAYOUT[size];
  const { locale } = useLocale();
  return (
    <OrbCard
      label={label}
      compact={size === "compact"}
      orb={layout.orb}
      stripBasis={layout.stripBasis}
      className={className}
      strip={
        <>
          <p className={cx("font-light text-ink", layout.dayClass)}>
            {formatWeekday(day, locale)}{" "}
            <br />
            <span className="text-faint">{formatDayMonth(day, locale)}</span>
          </p>
          <p className="mt-2 text-small text-mute-2">{formatHebrewDate(day, locale)}</p>
        </>
      }
    />
  );
}
