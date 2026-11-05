import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import { useGroups, useMaySee, useParticipantsOf } from "../../data/queries";
import { addDays, dayAt, isoDay, monthDays, now, shiftMonth } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatMonthYear, formatWeekday, formatWeekdayLetter } from "../../lib/format";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { SectionHeader } from "../../ui/SectionHeader";
import { Surface } from "../../ui/Surface";
import {
  HOLIDAY_LOOKAHEAD_DAYS,
  bookingItems,
  comingUp,
  eventGroupsToRead,
  flightItems,
  holidayItems,
  itemsByDay,
  kindsOf,
  type CalendarItem,
  type CalendarKind,
} from "./calendar-model";
import { InlineRetry, LinesSkeleton } from "./OverviewStates";

/** A Sunday, to name the weekdays above the grid. */
const A_SUNDAY = "2026-11-01";
/** How many items "coming up" lists: two on desktop, so the card stays as tall as the week card beside it. */
const SHOWN = { desktop: 2, phone: 3 } as const;
const DOT: Record<CalendarKind, string> = { holiday: "bg-status-talking", flight: "bg-ink", event: "bg-gold" };

interface CalendarState {
  phone: boolean;
  className?: string;
  /** YYYY-MM-DD. */
  today: string;
  /** The shown month, YYYY-MM. */
  month: string;
  /** A day picked in the grid, whose items the list shows instead of what's coming up. */
  picked: string | null;
  onMonth: (month: string) => void;
  onPick: (day: string | null) => void;
}

interface CalendarData {
  /** Flights and bookings; holidays the card works out itself. */
  items: CalendarItem[];
  loading: boolean;
  onRetry: (() => void) | null;
}

/**
 * The calendar in place of the next greeting: a month of challah bookings, flights and holidays, with what's coming up
 * under it (or a picked day's items). Bookings and flights only for those who may see customers; holidays for everyone.
 */
export function CalendarCard({ phone, className }: { phone: boolean; className?: string }) {
  const seesGroups = useMaySee("customers");
  const today = isoDay(now());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const state: CalendarState = {
    phone,
    className,
    today,
    month,
    picked,
    onMonth: (next) => {
      setMonth(next);
      setPicked(null);
    },
    onPick: setPicked,
  };
  return seesGroups ? <CalendarWithGroups {...state} /> : <CalendarView {...state} items={[]} loading={false} onRetry={null} />;
}

/** Reads the groups, then the bookings of the challah months it needs, and hands their items to the view. */
function CalendarWithGroups(state: CalendarState) {
  const { overview } = useCopy();
  const copy = overview.calendar;
  const groups = useGroups();
  const ids = groups.data ? eventGroupsToRead(groups.data, state.month, state.today) : [];
  const participants = useParticipantsOf(ids);
  const items = [
    ...(groups.data ? flightItems(groups.data, copy) : []),
    ...participants.flatMap((query) => (query.data ? bookingItems(query.data, copy) : [])),
  ];
  const failed = (groups.isError && !groups.data) || participants.some((query) => query.isError && !query.data);
  const loading = !failed && (groups.data === undefined || participants.some((query) => query.data === undefined));
  const onRetry = failed
    ? () => {
        if (groups.isError) void groups.refetch();
        for (const query of participants) if (query.isError) void query.refetch();
      }
    : null;
  return <CalendarView {...state} items={items} loading={loading} onRetry={onRetry} />;
}

function CalendarView({ phone, className, today, month, picked, onMonth, onPick, items, loading, onRetry }: CalendarState & CalendarData) {
  const { overview, holidayNames } = useCopy();
  const copy = overview.calendar;
  const { locale } = useLocale();
  const headingId = useId();
  // The shown month's holidays, and enough ahead for "coming up".
  const holidays = useMemo(() => {
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;
    const ahead = isoDay(addDays(dayAt(today), HOLIDAY_LOOKAHEAD_DAYS));
    return holidayItems(monthStart < today ? monthStart : today, monthEnd > ahead ? monthEnd : ahead, holidayNames, locale);
  }, [month, today, holidayNames, locale]);
  const all = [...holidays, ...items];
  const byDay = itemsByDay(all);
  const listed = picked ? (byDay.get(picked) ?? []) : comingUp(all, today, SHOWN[phone ? "phone" : "desktop"]);

  return (
    <Surface variant="card" compact={phone} aria-labelledby={headingId} className={cx("flex flex-col gap-3", className)}>
      <SectionHeader
        id={headingId}
        title={copy.title}
        subtitle={<span aria-live="polite">{formatMonthYear(dayAt(`${month}-15`), locale)}</span>}
        trailing={
          <div className="flex items-center gap-1.5">
            <StepButton icon="earlier" label={copy.previousMonth} onClick={() => onMonth(shiftMonth(month, -1))} />
            <StepButton icon="forward" label={copy.nextMonth} onClick={() => onMonth(shiftMonth(month, 1))} />
          </div>
        }
        flush
      />
      <MonthGrid phone={phone} month={month} today={today} picked={picked} byDay={byDay} onPick={onPick} />
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-mute">{picked ? `${formatWeekday(dayAt(picked), locale)} ${formatDayMonth(dayAt(picked), locale)}` : copy.comingUp}</p>
          {picked ? (
            <button type="button" onClick={() => onPick(null)} className="text-caption font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
              {copy.backToComingUp}
            </button>
          ) : null}
        </div>
        {onRetry ? <InlineRetry onRetry={onRetry} /> : null}
        {loading && !picked ? <LinesSkeleton widths={["w-40", "w-32", "w-36"]} /> : null}
        {!loading || picked ? (
          listed.length > 0 ? (
            <ul className="flex flex-col">
              {listed.map((item) => (
                <li key={item.key}>
                  <ItemRow phone={phone} item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-small text-mute">{picked ? copy.nothingThatDay : copy.nothingAhead}</p>
          )
        ) : null}
      </div>
    </Surface>
  );
}

/** The month, Sunday first: today in gold, a dot for each kind of item on a day. Days with items can be picked. */
function MonthGrid({
  phone,
  month,
  today,
  picked,
  byDay,
  onPick,
}: {
  phone: boolean;
  month: string;
  today: string;
  picked: string | null;
  byDay: Map<string, CalendarItem[]>;
  onPick: (day: string | null) => void;
}) {
  const { overview } = useCopy();
  const copy = overview.calendar;
  const { locale } = useLocale();
  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden="true" className="grid grid-cols-7 text-center text-caption text-mute">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>{formatWeekdayLetter(addDays(dayAt(A_SUNDAY), index), locale)}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {monthDays(month).map((day, index) => {
          if (!day) return <span key={`blank-${index}`} />;
          const dayItems = byDay.get(day) ?? [];
          const on = day === picked;
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              disabled={dayItems.length === 0}
              aria-pressed={on}
              aria-current={isToday ? "date" : undefined}
              aria-label={copy.dayLabel(formatDayMonth(dayAt(day), locale), dayItems.length)}
              onClick={() => onPick(on ? null : day)}
              className={cx(
                "relative flex items-start justify-center rounded-[10px] transition-colors disabled:cursor-default",
                phone ? "h-10 pt-1" : "h-8 pt-0.5",
                on ? "bg-ink" : dayItems.length > 0 && "hover:bg-sand-light",
              )}
            >
              <span
                className={cx(
                  "inline-flex items-center justify-center rounded-full text-small tabular-nums",
                  phone ? "size-6" : "size-[22px]",
                  isToday ? "bg-gold font-medium text-ink" : on ? "text-cream" : day < today ? "text-faint" : "text-copy",
                )}
              >
                {Number(day.slice(8))}
              </span>
              <span aria-hidden="true" className={cx("absolute inset-x-0 flex h-1.5 justify-center gap-0.5", phone ? "bottom-1" : "bottom-0")}>
                {kindsOf(dayItems).map((kind) => (
                  <span key={kind} className={cx("size-1.5 rounded-full", on && kind === "flight" ? "bg-cream" : DOT[kind])} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One item: its day, a dot for its kind, what it is and the detail. Bookings open the customer, flights the trip. */
function ItemRow({ phone, item }: { phone: boolean; item: CalendarItem }) {
  const { locale } = useLocale();
  const date = dayAt(item.day);
  const content = (
    <>
      <span className={cx("flex shrink-0 flex-col items-center gap-0.5 rounded-[12px] bg-sand-light leading-none", phone ? "w-11 py-1.5" : "w-10 py-1")}>
        <span className="text-caption text-mute">{formatWeekdayLetter(date, locale)}</span>
        <span className="text-small font-medium text-ink tabular-nums">{formatDayMonth(date, locale).replace(/(^|\D)0(\d)/g, "$1$2")}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", DOT[item.kind])} />
          <span className="truncate text-small font-medium text-ink">{item.title}</span>
        </span>
        {item.detail ? <span className="block truncate text-caption text-mute">{item.detail}</span> : null}
      </span>
    </>
  );
  const row = cx("flex items-center gap-3 rounded-[14px]", phone ? "p-1.5" : "p-1");
  return item.to ? (
    <Link to={item.to} className={cx(row, "transition-colors hover:bg-sand-light")}>
      {content}
    </Link>
  ) : (
    <div className={row}>{content}</div>
  );
}

function StepButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-full text-ink ring-1 ring-line ring-inset transition-colors hover:bg-sand-light"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
