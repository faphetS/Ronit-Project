import type { ReactNode } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatWeekday } from "../../lib/format";
import { formatHebrewDate } from "../../lib/hebrew";
import { nextHoliday } from "../../lib/holidays";
import { OrbCard } from "../../ui/OrbCard";

type TodayCardSize = "tall" | "regular" | "compact";

const LAYOUT: Record<TodayCardSize, { orb: { size: number; end: number; top: number | string }; stripBasis: string; dayClass: string }> = {
  // The tall card takes the height of what stands beside it: its orb sits a little below the middle at any height.
  tall: { orb: { size: 290, end: 28, top: "calc(54% - 145px)" }, stripBasis: "55%", dayClass: "text-[76px] leading-none" },
  regular: { orb: { size: 180, end: 54, top: 60 }, stripBasis: "55%", dayClass: "text-display" },
  compact: { orb: { size: 170, end: 92, top: 40 }, stripBasis: "50%", dayClass: "text-[44px] leading-none" },
};

interface TodayCardProps {
  day: Date;
  label: string;
  size?: TodayCardSize;
  /** Lines under the holiday countdown, inside the frosted strip. */
  footer?: ReactNode;
  /** Content of the white side. */
  side?: ReactNode;
  className?: string;
}

/** The orb card with the weekday, the date, the Hebrew date and the next holiday. */
export function TodayCard({ day, label, size = "regular", footer, side, className }: TodayCardProps) {
  const layout = LAYOUT[size];
  const { locale } = useLocale();
  const { holidayCountdown, holidayNames } = useCopy();
  const holiday = nextHoliday(day);
  return (
    <OrbCard
      label={label}
      compact={size === "compact"}
      orb={layout.orb}
      stripBasis={layout.stripBasis}
      className={className}
      side={side}
      strip={
        <>
          <p className={cx("font-light text-ink", layout.dayClass)}>
            {formatWeekday(day, locale)}{" "}
            <br />
            <span className="text-faint">{formatDayMonth(day, locale)}</span>
          </p>
          <p className="mt-2 text-small text-mute-2">{formatHebrewDate(day, locale)}</p>
          <span className="flex-1" />
          <p className="font-medium text-ink">{holidayCountdown(holidayNames[holiday.key], holiday.daysToEve)}</p>
          {footer}
        </>
      }
    />
  );
}
