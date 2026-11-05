import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useLeadCounts, useLeadDays } from "../../data/queries";
import type { Lead, LeadSource } from "../../data/types";
import { addDays, dayAt, isoDay, monthDays, now, shiftMonth } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatMonthYear, formatNumber, formatWeekday, formatWeekdayLetter } from "../../lib/format";
import { cardVariants } from "../../motion/variants";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { ErrorState, Skeleton } from "../../ui/states";
import { ALL, TODAY } from "./leads-url";

/** The strip shows two weeks and moves one week at a time. */
const STRIP_DAYS = 14;
const STEP_DAYS = 7;
/** The tallest bar in the strip, in px. */
const BAR_MAX = 84;
/** A Sunday, to name the weekdays above the calendar. */
const A_SUNDAY = "2026-11-01";

const shiftDay = (day: string, days: number): string => isoDay(addDays(dayAt(day), days));
const earlierOf = (a: string, b: string): string => (a < b ? a : b);

/** A busier day has a fuller bubble in the calendar. */
function bubbleTone(count: number): string {
  if (count >= 10) return "bg-status-new";
  if (count >= 6) return "bg-gold";
  if (count >= 3) return "bg-gold/55";
  return "bg-gold/25";
}

interface LeadsDayPanelProps {
  /** The board's day from the address: TODAY, ALL, or YYYY-MM-DD. */
  day: string;
  onDay: (day: string) => void;
  /** The leads on the board now, to say where the day's leads came from. Undefined while they load. */
  shown: Lead[] | undefined;
  /** Source or service filters are on, so the board shows only part of the day. */
  filtered: boolean;
}

/**
 * How many leads came in on a day: the number for the chosen day (today, until another is picked), two weeks of
 * days with their counts, and a month calendar for any day before. Picking a day puts its leads on the board.
 */
export function LeadsDayPanel({ day, onDay, shown, filtered }: LeadsDayPanelProps) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const days = useLeadDays();
  const counts = useLeadCounts();
  const today = isoDay(now());
  const selected = day === ALL ? null : day === TODAY ? today : day;
  const byDay = useMemo(() => new Map((days.data ?? []).map((entry) => [entry.day, entry.count])), [days.data]);
  const countOf = (date: string) => byDay.get(date) ?? 0;
  const firstDay = earlierOf(days.data?.[0]?.day ?? today, today);
  const dayMonth = (date: string) => formatDayMonth(dayAt(date), locale);

  // The strip ends on `end`. It moves a week at a time, and follows a day picked in the calendar or the address.
  const anchor = selected && selected <= today ? selected : null;
  const [end, setEnd] = useState(anchor ?? today);
  const [followed, setFollowed] = useState(anchor);
  const start = shiftDay(end, -(STRIP_DAYS - 1));
  if (anchor !== followed) {
    setFollowed(anchor);
    if (anchor && (anchor > end || anchor < start)) setEnd(earlierOf(shiftDay(anchor, 3), today));
  }

  const [calendar, setCalendar] = useState(false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const toggleCalendar = () => {
    if (!calendar) setMonth((anchor ?? today).slice(0, 7));
    setCalendar(!calendar);
  };
  const pick = (date: string) => {
    onDay(date === today ? TODAY : date);
    setCalendar(false);
  };

  let title: string;
  let number: string | null;
  let unit: string;
  let line: string | null;
  if (selected) {
    const relative = selected === today ? copy.days.today : selected === shiftDay(today, -1) ? copy.days.yesterday : null;
    const count = countOf(selected);
    title = copy.days.title(relative, formatWeekday(dayAt(selected), locale), dayMonth(selected));
    number = days.data ? formatNumber(count) : null;
    unit = copy.days.unit(count);
    if (!shown) line = null;
    else if (filtered) line = copy.days.filtered(formatNumber(shown.length));
    else if (count === 0) line = copy.days.none;
    else line = sourcesLine(shown, (source) => copy.sources[source], copy.separator);
  } else {
    const all = counts.data;
    title = copy.days.allDays;
    number = all ? formatNumber(all.all) : null;
    unit = copy.days.openUnit;
    line = all
      ? [
          copy.days.split.new(formatNumber(all.new)),
          copy.days.split.working(formatNumber(all.talking + all["details-sent"])),
          copy.days.split["no-answer"](formatNumber(all["no-answer"])),
          copy.days.split.registered(formatNumber(all.registered)),
        ].join(copy.separator)
      : null;
  }

  let body;
  if (days.isError && !days.data) body = <ErrorState onRetry={() => void days.refetch()} />;
  else if (!days.data) body = <Skeleton className="h-[172px] w-full rounded-2xl" />;
  else if (calendar) body = <MonthGrid month={month} today={today} selected={selected} countOf={countOf} onPick={pick} />;
  else body = <DayStrip start={start} today={today} selected={selected} countOf={countOf} onPick={pick} />;

  return (
    <motion.section variants={cardVariants} aria-label={copy.days.label} className="surface-card flex flex-wrap items-stretch gap-x-6 gap-y-4 rounded-card px-6 py-5">
      <div aria-live="polite" className="flex min-w-[200px] flex-[0_1_240px] flex-col justify-center gap-1 border-line lg:border-e lg:pe-6">
        <p className="text-small text-mute">{title}</p>
        {number === null ? (
          <Skeleton className="my-2 h-16 w-24" />
        ) : (
          <>
            <p className="text-[72px] leading-none font-light text-ink tabular-nums">{number}</p>
            <p className="text-body text-ink">{unit}</p>
          </>
        )}
        {line === null ? <Skeleton className="h-4 w-36" /> : <p className="text-small text-mute">{line}</p>}
      </div>

      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-medium text-ink">
            {calendar ? formatMonthYear(dayAt(`${month}-15`), locale) : copy.days.range(dayMonth(start), dayMonth(end))}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <PanelToggle pressed={day === ALL} onClick={() => onDay(day === ALL ? TODAY : ALL)}>
              {copy.days.allDays}
            </PanelToggle>
            {day !== TODAY ? (
              <button
                type="button"
                onClick={() => pick(today)}
                className="h-10 rounded-full bg-gold/25 px-4 text-small font-medium text-ink transition-colors hover:bg-gold/40"
              >
                {copy.days.backToToday}
              </button>
            ) : null}
            {calendar ? (
              <>
                <StepButton icon="earlier" label={copy.days.previousMonth} disabled={month <= firstDay.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))} />
                <StepButton icon="forward" label={copy.days.nextMonth} disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} />
              </>
            ) : (
              <>
                <StepButton icon="earlier" label={copy.days.earlier} disabled={start <= firstDay} onClick={() => setEnd(shiftDay(end, -STEP_DAYS))} />
                <StepButton
                  icon="forward"
                  label={copy.days.later}
                  disabled={end >= today}
                  onClick={() => setEnd(earlierOf(shiftDay(end, STEP_DAYS), today))}
                />
              </>
            )}
            <PanelToggle pressed={calendar} onClick={toggleCalendar} icon="calendar">
              {copy.days.calendar}
            </PanelToggle>
          </div>
        </div>
        {body}
      </div>
    </motion.section>
  );
}

/** "פייסבוק 3 · אינסטגרם 2": where the leads came from, most first. */
function sourcesLine(leads: Lead[], name: (source: LeadSource) => string, separator: string): string {
  const tally = new Map<LeadSource, number>();
  for (const lead of leads) tally.set(lead.source, (tally.get(lead.source) ?? 0) + 1);
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${name(source)} ${formatNumber(count)}`)
    .join(separator);
}

interface DaysProps {
  today: string;
  selected: string | null;
  countOf: (date: string) => number;
  onPick: (date: string) => void;
}

/** Two weeks, a bar each, as tall as the day's count. */
function DayStrip({ start, today, selected, countOf, onPick }: DaysProps & { start: string }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const dates = Array.from({ length: STRIP_DAYS }, (_, index) => shiftDay(start, index));
  const peak = Math.max(1, ...dates.map(countOf));
  return (
    <div className="grid grid-cols-14 gap-1">
      {dates.map((date) => {
        const count = countOf(date);
        const on = date === selected;
        const height = count ? Math.max(6, Math.round((count / peak) * BAR_MAX)) : 3;
        const dayMonth = formatDayMonth(dayAt(date), locale);
        return (
          <button
            key={date}
            type="button"
            aria-pressed={on}
            aria-label={copy.days.dayLabel(dayMonth, count)}
            onClick={() => onPick(date)}
            className={cx("flex h-[172px] flex-col items-center justify-end gap-1.5 rounded-2xl py-2 transition-colors", on ? "bg-cream" : "hover:bg-sand-light")}
          >
            <span className={cx("text-small font-medium tabular-nums", on ? "text-ink" : "text-mute")}>{formatNumber(count)}</span>
            <span aria-hidden="true" className={cx("w-[58%] max-w-7 rounded-lg", on ? "bg-ink" : count ? "bg-gold" : "bg-line")} style={{ height }} />
            <span className="text-caption text-mute">{formatWeekdayLetter(dayAt(date), locale)}</span>
            <span className={cx("text-caption", date === today ? "font-semibold text-ink" : "text-copy")}>{dayMonth}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A month, each day with its count. Days to come can't be picked. */
function MonthGrid({ month, today, selected, countOf, onPick }: DaysProps & { month: string }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const dates = monthDays(month);
  const total = dates.reduce((sum, date) => sum + (date ? countOf(date) : 0), 0);
  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center text-caption text-mute">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>{formatWeekdayLetter(dayAt(shiftDay(A_SUNDAY, index)), locale)}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} />;
          const count = countOf(date);
          const future = date > today;
          const on = date === selected;
          return (
            <button
              key={date}
              type="button"
              disabled={future}
              aria-pressed={on}
              aria-label={copy.days.dayLabel(formatDayMonth(dayAt(date), locale), count)}
              onClick={() => onPick(date)}
              className={cx(
                "relative flex h-12 items-center justify-center rounded-[14px] transition-colors disabled:cursor-default",
                on ? "bg-ink text-cream" : future ? "text-faint" : "bg-sand-light hover:bg-cream",
              )}
            >
              <span className={cx("absolute start-2 top-1 text-caption", on ? "text-ink-text" : future ? "text-faint/70" : "text-mute")}>
                {Number(date.slice(8))}
              </span>
              {count > 0 && !future ? (
                <span
                  className={cx(
                    "mt-2 inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full px-1.5 text-small font-medium text-ink tabular-nums",
                    bubbleTone(count),
                  )}
                >
                  {formatNumber(count)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-small text-mute">{copy.days.monthTotal(formatNumber(total))}</p>
    </div>
  );
}

function PanelToggle({ pressed, onClick, icon, children }: { pressed: boolean; onClick: () => void; icon?: IconName; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-small font-medium transition-colors",
        pressed ? "bg-ink text-cream" : "text-ink ring-1 ring-ink/28 ring-inset hover:bg-sand-light",
      )}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

function StepButton({ icon, label, disabled, onClick }: { icon: IconName; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-10 items-center justify-center rounded-full text-ink ring-1 ring-line ring-inset transition-colors hover:bg-sand-light disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
