import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import { useCan, useGroups, useMaySee } from "../../data/queries";
import type { GroupSummary } from "../../data/types";
import { dayAt, daysBetween, isoDay, now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber } from "../../lib/format";
import { formatHebrewDate } from "../../lib/hebrew";
import { springs } from "../../motion/springs";
import { cardVariants } from "../../motion/variants";
import { BigNumber } from "../../ui/BigNumber";
import { Icon } from "../../ui/Icon";
import { Skeleton } from "../../ui/states";
import { groupDate } from "../groups/groups";
import { tripsAhead, type TripAhead } from "./leads-model";

/** The meter shows the last 30 days before a trip, a bar a day, and fills as they pass. */
const RUN_UP_DAYS = 30;

const groupHref = (group: GroupSummary) => `/groups/${encodeURIComponent(group.id)}`;

/** Where a trip stands today: the days until it starts, or the day of it for a flight under way. */
function tripClock(trip: TripAhead, today: string) {
  const { startsOn, endsOn } = trip.group;
  const start = dayAt(startsOn ?? today);
  const days = Math.max(0, daysBetween(dayAt(today), start));
  const tripDay = trip.underWay ? daysBetween(start, dayAt(today)) + 1 : 0;
  const tripDays = endsOn ? daysBetween(start, dayAt(endsOn)) + 1 : 1;
  return { days, tripDay, tripDays };
}

/**
 * The card above the leads' day chart: the nearest flight or event, how many days until it, a bar for each of the 30
 * days before it that fills as they pass, how many are registered (and the passports in, for a flight), and the trip
 * after it. A flight under way shows its day instead. Without a dated trip it says how to get one here.
 */
export function NextTripCard({ className }: { className?: string }) {
  // Groups sit under customers in the role table. The page asks the same, to lay the card beside the day chart.
  const sees = useMaySee("customers");
  const known = useCan("customers", "view");
  if (!sees) return null;
  // Until the role is known nothing asks for the groups; the card holds its place.
  return known ? <TripCard className={className} /> : <LoadingCard className={className} />;
}

function Shell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <motion.section variants={cardVariants} aria-label={label} className={cx("@container surface-ink rounded-card px-6 py-5", className)}>
      {children}
    </motion.section>
  );
}

function LoadingCard({ className }: { className?: string }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <Shell label={copy.nextTrip.label.flight} className={className}>
      <div aria-busy="true" className="flex h-full flex-col gap-5">
        <div className="flex items-center gap-3">
          <Skeleton onDark className="size-10 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton onDark className="h-3 w-24" />
            <Skeleton onDark className="h-4 w-40" />
          </div>
        </div>
        <Skeleton onDark className="h-16 w-44" />
        <Skeleton onDark className="h-7 w-full" />
      </div>
    </Shell>
  );
}

function TripCard({ className }: { className?: string }) {
  const { leadsCopy, states } = useCopy();
  const copy = leadsCopy.nextTrip;
  const { locale } = useLocale();
  const groups = useGroups();
  const today = isoDay(now());

  if (!groups.data) {
    if (!groups.isError) return <LoadingCard className={className} />;
    return (
      <Shell label={copy.label.flight} className={className}>
        <div className="flex h-full flex-col items-start justify-center gap-3">
          <p className="text-body text-cream">{copy.failed}</p>
          <button
            type="button"
            onClick={() => void groups.refetch()}
            className="h-10 rounded-full px-4 text-small font-medium text-cream ring-1 ring-white/25 ring-inset transition-colors hover:bg-white/10"
          >
            {states.retry}
          </button>
        </div>
      </Shell>
    );
  }

  const [trip, after] = tripsAhead(groups.data, today);
  if (!trip) {
    return (
      <Shell label={copy.label.flight} className={className}>
        <div className="flex h-full flex-col items-start justify-center gap-3">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-white/10 text-gold">
            <Icon name="groups" size={18} className="rtl:-scale-x-100" />
          </span>
          <p className="text-title font-medium text-cream">{copy.none}</p>
          <p className="max-w-[34ch] text-small text-ink-soft">{copy.noneHint}</p>
          <Link to="/groups" className="mt-1 inline-flex h-10 items-center rounded-full bg-cream px-4 text-small font-medium text-ink transition-colors hover:bg-white">
            {copy.toGroups}
          </Link>
        </div>
      </Shell>
    );
  }

  const { group, underWay } = trip;
  const flight = group.type === "flight";
  const { days, tripDay, tripDays } = tripClock(trip, today);
  const start = dayAt(group.startsOn ?? today);
  const label = underWay ? copy.underWay : copy.label[group.type === "event" ? "event" : "flight"];
  const kind = flight ? "flight" : "event";

  let dates: string;
  if (group.dateLabel) dates = groupDate(group, locale) ?? group.dateLabel;
  else if (underWay && group.endsOn) dates = copy.back(formatDayMonth(dayAt(group.endsOn), locale));
  else {
    const range = group.endsOn && group.endsOn !== group.startsOn ? copy.dates(formatDayMonth(start, locale), formatDayMonth(dayAt(group.endsOn), locale)) : formatDayMonth(start, locale);
    dates = `${range} · ${formatHebrewDate(start, locale)}`;
  }

  let figure: ReactNode;
  let unit: string;
  if (underWay) {
    figure = <BigNumber value={tripDay} total={tripDays} size={64} surface="ink" />;
    unit = copy.tripDay;
  } else if (days === 0) {
    figure = <BigNumber value={copy.todayNumber} size={56} surface="ink" />;
    unit = copy.today[kind];
  } else {
    figure = <BigNumber value={days} size={64} surface="ink" countUp />;
    unit = copy.unit[kind](days);
  }

  const stats = [
    group.capacity !== null ? copy.seats(formatNumber(group.registered), formatNumber(group.capacity)) : copy.registered(formatNumber(group.registered)),
    flight && group.registered > 0 && group.readiness !== null ? copy.passports(formatNumber(group.readiness)) : null,
  ].filter(Boolean);

  return (
    <Shell label={label} className={className}>
      <div className="flex h-full flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:gap-10">
        <div className="flex flex-col gap-4 @3xl:shrink-0">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="orb grid size-10 shrink-0 place-items-center text-ink">
              <Icon name={flight ? "groups" : "calendar"} size={18} className={flight ? "rtl:-scale-x-100" : undefined} />
            </span>
            <div className="min-w-0">
              <p className="text-small text-ink-soft">{label}</p>
              <Link to={groupHref(group)} className="block truncate text-[18px] leading-snug font-medium text-cream transition-colors hover:text-gold">
                <bdi>{group.shortName}</bdi>
              </Link>
            </div>
          </div>
          <div className="flex items-end gap-3">
            {figure}
            <div className="min-w-0 pb-1">
              <p className="text-body text-cream">{unit}</p>
              <p className="text-small text-ink-soft">{dates}</p>
            </div>
          </div>
        </div>

        <RunUp days={underWay ? 0 : days} departure={formatDayMonth(start, locale)} flight={flight} className="@3xl:flex-1" />

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-small @3xl:mt-0 @3xl:flex-col @3xl:items-start @3xl:border-t-0 @3xl:pt-0">
          <p className="text-ink-text tabular-nums">{stats.join(leadsCopy.separator)}</p>
          {after ? (
            <Link to={groupHref(after.group)} className="min-w-0 truncate text-ink-soft transition-colors hover:text-cream">
              {copy.then} · <bdi>{after.group.shortName}</bdi> · {groupDate(after.group, locale, false)}
            </Link>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

/**
 * The last 30 days before a trip, a bar each: the days gone by in gold, today raised in cream, the rest faint, and the
 * plane (or the calendar, for an event) at the end with the day it starts. More than 30 days away, every bar is still
 * faint. The bars keep their width and spread out on a wide card.
 */
function RunUp({ days, departure, flight, className }: { days: number; departure: string; flight: boolean; className?: string }) {
  const { leadsCopy } = useCopy();
  const copy = leadsCopy.nextTrip;
  const reduceMotion = useReducedMotion();
  // Today's bar; RUN_UP_DAYS or more is the day it leaves, below 0 is further off than the meter reaches.
  const todayAt = RUN_UP_DAYS - days;
  const todayShown = todayAt >= 0 && todayAt < RUN_UP_DAYS;
  return (
    <div role="img" aria-label={copy.runUp(days)} className={cx("flex items-start gap-3", className)}>
      <div className="relative min-w-0 flex-1 pb-6">
        <div className="flex h-9 items-center justify-between">
          {Array.from({ length: RUN_UP_DAYS }, (_, index) => {
            const passed = index < todayAt;
            const isToday = index === todayAt;
            return (
              <motion.span
                key={index}
                initial={reduceMotion ? false : { scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1, transition: { ...springs.gentle, delay: 0.2 + index * 0.014 } }}
                className={cx(
                  "shrink-0 rounded-full",
                  isToday ? "h-9 w-[7px] bg-cream shadow-[0_0_14px_rgb(247_243_238/0.45)]" : "h-4 w-[5px]",
                  !isToday && (passed ? "bg-gold" : "bg-white/12"),
                )}
              />
            );
          })}
        </div>
        {todayShown ? (
          <span
            aria-hidden="true"
            className="absolute top-10 -translate-x-1/2 text-caption whitespace-nowrap text-cream rtl:translate-x-1/2"
            style={{ insetInlineStart: `calc(${todayAt / (RUN_UP_DAYS - 1)} * (100% - 7px) + 3.5px)` }}
          >
            {copy.todayMark}
          </span>
        ) : (
          <span aria-hidden="true" className="absolute start-0 top-10 text-caption text-ink-soft">
            {days > RUN_UP_DAYS ? copy.runUpFar : null}
          </span>
        )}
      </div>
      <div aria-hidden="true" className="flex shrink-0 flex-col items-center gap-1">
        <span className="grid size-9 place-items-center rounded-full bg-gold text-ink">
          <Icon name={flight ? "groups" : "calendar"} size={17} className={flight ? "rtl:-scale-x-100" : undefined} />
        </span>
        <span className="text-caption text-ink-text tabular-nums">{departure}</span>
      </div>
    </div>
  );
}

/** On phones, under the title: the nearest trip, how soon, and how full it is. A press opens the group. */
export function NextTripPill({ className }: { className?: string }) {
  const seesGroups = useCan("customers", "view");
  return seesGroups ? <TripPill className={className} /> : null;
}

function TripPill({ className }: { className?: string }) {
  const { leadsCopy } = useCopy();
  const copy = leadsCopy.nextTrip;
  const groups = useGroups();
  const today = isoDay(now());
  const trip = groups.data ? tripsAhead(groups.data, today)[0] : undefined;
  if (!trip) return null;
  const { group, underWay } = trip;
  const { days } = tripClock(trip, today);
  const seats =
    group.capacity !== null ? copy.seats(formatNumber(group.registered), formatNumber(group.capacity)) : copy.registered(formatNumber(group.registered));
  return (
    <Link
      to={groupHref(group)}
      className={cx(
        "inline-flex h-11 max-w-full items-center gap-2.5 rounded-full bg-white/55 ps-1.5 pe-4 text-[14px] ring-1 ring-white/85 ring-inset transition-colors hover:bg-white",
        className,
      )}
    >
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-cream">
        <Icon name={group.type === "flight" ? "groups" : "calendar"} size={15} className={group.type === "flight" ? "rtl:-scale-x-100" : undefined} />
      </span>
      <span className="sr-only">{underWay ? copy.underWay : copy.label[group.type === "event" ? "event" : "flight"]}</span>
      <bdi className="min-w-0 truncate font-medium text-ink">{group.shortName}</bdi>
      <span className={cx("shrink-0 font-medium whitespace-nowrap", underWay || days <= 7 ? "text-status-talking-deep" : "text-copy")}>
        {underWay ? copy.underWay : copy.when(days)}
      </span>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-ink/15" />
      <span className="shrink-0 whitespace-nowrap text-copy tabular-nums">{seats}</span>
    </Link>
  );
}
