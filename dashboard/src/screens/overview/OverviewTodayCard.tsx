import type { ReactNode } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useBirthdays, useMaySee, usePassportIntakes } from "../../data/queries";
import { today } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatWeekday } from "../../lib/format";
import { formatHebrewDate } from "../../lib/hebrew";
import { GooButton } from "../../ui/GooButton";
import { OrbCard } from "../../ui/OrbCard";
import { Skeleton } from "../../ui/states";
import { birthdayLines, isToday } from "./overview-model";
import { InlineRetry, LinesSkeleton } from "./OverviewStates";

// Orb sizes and places from the boards: Main (desktop) and Mobile-Home.
const LAYOUT = {
  desktop: { orb: { size: 220, end: 66, top: 74 }, stripBasis: "55%", minHeight: "min-h-[330px]" },
  phone: { orb: { size: 180, end: 90, top: 38 }, stripBasis: "50%", minHeight: "min-h-[262px]" },
} as const;

/** The orb card for today: the date, the Hebrew date, today's birthday greetings, and new passports, each for those who may see them. */
export function OverviewTodayCard({ phone, className }: { phone: boolean; className?: string }) {
  const { overview: copy } = useCopy();
  const { locale } = useLocale();
  const birthdays = useBirthdays();
  const intakes = usePassportIntakes();
  const seesBirthdays = useMaySee("greetings");
  const seesPassports = useMaySee("passports");
  const layout = LAYOUT[phone ? "phone" : "desktop"];
  const day = today();
  const lines = seesBirthdays && birthdays.data ? birthdayLines(birthdays.data.today, copy) : null;
  const passportsToday = intakes.data ? intakes.data.filter((intake) => isToday(intake.receivedAt)).length : null;
  const sideText = cx("text-mute", phone ? "text-caption" : "text-small");

  let passports: ReactNode;
  if (!seesPassports) {
    passports = null;
  } else if (passportsToday !== null) {
    if (phone) {
      const [first, second] = copy.passportsTodayLines(passportsToday);
      passports = (
        <p className={sideText}>
          {first}{" "}
          <br />
          {second}
        </p>
      );
    } else {
      passports = (
        <p className={sideText}>
          {copy.sideNote}{" "}
          <br />
          {copy.passportsNew(passportsToday)}
        </p>
      );
    }
  } else if (intakes.isError) {
    passports = <InlineRetry onRetry={() => void intakes.refetch()} />;
  } else {
    passports = (
      <div className="flex flex-col items-end gap-2">
        {phone ? null : <p className={sideText}>{copy.sideNote}</p>}
        <Skeleton className="h-3.5 w-24" />
      </div>
    );
  }

  return (
    <OrbCard
      label={copy.today}
      compact={phone}
      orb={layout.orb}
      stripBasis={layout.stripBasis}
      className={cx(layout.minHeight, className)}
      strip={
        <>
          <p className={cx("font-light text-ink", phone ? "text-[44px] leading-none" : "text-display")}>
            {formatWeekday(day, locale)}{" "}
            <br />
            <span className="text-faint">{formatDayMonth(day, locale)}</span>
          </p>
          <p className={cx("text-mute-2", phone ? "mt-1.5 text-caption" : "mt-2 text-small")}>{formatHebrewDate(day, locale)}</p>
          <span className="flex-1" />
          {!seesBirthdays ? null : lines ? (
            <>
              <p className={cx("font-medium text-ink", phone && "text-small")}>{lines.title}</p>
              {lines.detail ? <p className={cx("text-mute-2", phone ? "text-caption" : "text-small")}>{lines.detail}</p> : null}
            </>
          ) : birthdays.isError ? (
            <InlineRetry onRetry={() => void birthdays.refetch()} />
          ) : (
            <LinesSkeleton widths={["w-32", "w-28"]} />
          )}
        </>
      }
      side={
        <>
          {passports}
          {seesBirthdays ? (
            <GooButton to="/greetings/birthdays" size="sm">
              {copy.birthdaysLink}
            </GooButton>
          ) : null}
        </>
      }
    />
  );
}
