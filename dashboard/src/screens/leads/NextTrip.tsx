import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import { useCan, useGroups, useMaySee } from "../../data/queries";
import type { GroupSummary } from "../../data/types";
import { dayAt, daysBetween, isoDay, now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber } from "../../lib/format";
import { formatHebrewDate } from "../../lib/hebrew";
import { cardVariants } from "../../motion/variants";
import { BigNumber } from "../../ui/BigNumber";
import { Icon } from "../../ui/Icon";
import { ICONS } from "../../ui/icons";
import { Skeleton } from "../../ui/states";
import { groupDate } from "../groups/groups";
import { tripsAhead, type TripAhead } from "./leads-model";

/** The plane flies the last 30 days before take-off: at home before them, landed on the day. */
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

/** The flight under way or the next one, the flight after it, and the nearest event. */
function nextOnes(groups: readonly GroupSummary[], today: string) {
  const ahead = tripsAhead(groups, today);
  const [flight = null, after = null] = ahead.filter((entry) => entry.group.type === "flight");
  const event = ahead.find((entry) => entry.group.type === "event") ?? null;
  return { flight, after, event };
}

/**
 * The card above the leads' day chart, a dark boarding pass for the next flight: a flight tracker with the plane along
 * its arc as far as the 30 days before take-off have gone, the days to go, and on the stub how many are registered
 * (and the passports in), the flight after it, and the nearest event when it comes first. A flight under way shows its
 * day instead. Without a dated flight it says how to get one here.
 */
export function NextTripCard({ className }: { className?: string }) {
  // Groups sit under customers in the role table. The page asks the same, to lay the card beside the day chart.
  const sees = useMaySee("customers");
  const known = useCan("customers", "view");
  if (!sees) return null;
  // Until the role is known nothing asks for the groups; the card holds its place.
  return known ? <TripCard className={className} /> : <LoadingCard className={className} />;
}

/**
 * The card's frame. A torn one is a ticket: a notch bitten out of each side, level with the dashed tear line above its
 * stub (the element marked data-tear). Laid out flat on a wide screen the stub has no line, so no notches.
 */
function Shell({ label, torn = false, className, children }: { label: string; torn?: boolean; className?: string; children: ReactNode }) {
  const ticketRef = useRef<HTMLDivElement>(null);
  useTearLine(ticketRef, torn);
  return (
    <motion.section variants={cardVariants} aria-label={label} className={cx("@container relative rounded-card", className)}>
      {/* The dark cards' shadow, on a layer of its own under the ticket: the notches would cut it off the ticket itself. */}
      <span aria-hidden="true" className="absolute inset-0 rounded-card shadow-ink" />
      <div
        ref={ticketRef}
        className={cx("surface-ink h-full rounded-card px-6 py-5 shadow-none", torn && "ticket @3xl:[-webkit-mask:none] @3xl:[mask:none]")}
      >
        {children}
      </div>
    </motion.section>
  );
}

/** Keeps the ticket's notches level with its tear line, wherever the stub's rows put it. */
function useTearLine(ref: RefObject<HTMLDivElement | null>, torn: boolean) {
  useLayoutEffect(() => {
    const ticket = ref.current;
    const tear = ticket?.querySelector<HTMLElement>("[data-tear]");
    if (!torn || !ticket || !tear || typeof ResizeObserver === "undefined") return;
    // Measured by layout, not on screen, so the card's entrance (a slight scale) can't throw it off.
    const place = () => ticket.style.setProperty("--notch-y", `${ticket.clientHeight - tear.offsetTop}px`);
    const observer = new ResizeObserver(place);
    observer.observe(ticket);
    observer.observe(tear);
    return () => observer.disconnect();
  });
}

function LoadingCard({ className }: { className?: string }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <Shell label={copy.nextTrip.label} className={className}>
      <div aria-busy="true" className="flex h-full flex-col gap-5">
        <div className="flex items-center gap-3">
          <Skeleton onDark className="size-10 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton onDark className="h-3 w-24" />
            <Skeleton onDark className="h-4 w-40" />
          </div>
        </div>
        <Skeleton onDark className="h-24 w-full" />
        <Skeleton onDark className="h-4 w-48" />
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
      <Shell label={copy.label} className={className}>
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

  const { flight, after, event } = nextOnes(groups.data, today);
  if (!flight) {
    return (
      <Shell label={copy.label} torn={Boolean(event)} className={className}>
        <div className="flex h-full flex-col gap-3">
          <div className="flex flex-1 flex-col items-start justify-center gap-3">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-white/10 text-gold">
              <Icon name="groups" size={18} className="rtl:-scale-x-100" />
            </span>
            <p className="text-title font-medium text-cream">{copy.none}</p>
            <p className="max-w-[34ch] text-small text-ink-soft">{copy.noneHint}</p>
            <Link to="/groups" className="mt-1 inline-flex h-10 items-center rounded-full bg-cream px-4 text-small font-medium text-ink transition-colors hover:bg-white">
              {copy.toGroups}
            </Link>
          </div>
          {event ? (
            <div data-tear className="border-t border-dashed border-white/20 pt-3 text-small">
              <EventLine event={event} today={today} />
            </div>
          ) : null}
        </div>
      </Shell>
    );
  }

  const { group, underWay } = flight;
  const { days, tripDay, tripDays } = tripClock(flight, today);
  const start = dayAt(group.startsOn ?? today);
  const label = underWay ? copy.underWay : copy.label;
  // The nearest event shows on the stub when it comes before the flight leaves: then it's the nearest thing of all.
  const eventFirst = event && !underWay && (event.group.startsOn ?? "") < (group.startsOn ?? "") ? event : null;

  // The dates beside the name: from and to, with the Hebrew date under them; the office's label for a whole month.
  let dates: string;
  let hebrewDate: string | null = null;
  if (group.dateLabel) dates = groupDate(group, locale) ?? group.dateLabel;
  else if (underWay && group.endsOn) dates = copy.back(formatDayMonth(dayAt(group.endsOn), locale));
  else {
    dates =
      group.endsOn && group.endsOn !== group.startsOn
        ? copy.dates(formatDayMonth(start, locale), formatDayMonth(dayAt(group.endsOn), locale))
        : formatDayMonth(start, locale);
    hebrewDate = formatHebrewDate(start, locale);
  }

  let figure: ReactNode;
  let unit: string;
  let pathLabel: string;
  if (underWay) {
    figure = <BigNumber value={tripDay} total={tripDays} size={52} surface="ink" />;
    unit = copy.tripDay;
    pathLabel = copy.underWay;
  } else if (days === 0) {
    figure = <BigNumber value={copy.todayNumber} size={46} surface="ink" />;
    unit = copy.today;
    pathLabel = copy.today;
  } else {
    figure = <BigNumber value={days} size={56} surface="ink" countUp />;
    unit = copy.unit(days);
    pathLabel = copy.path(days);
  }

  const stats = [
    group.capacity !== null ? copy.seats(formatNumber(group.registered), formatNumber(group.capacity)) : copy.registered(formatNumber(group.registered)),
    group.registered > 0 && group.readiness !== null ? copy.passports(formatNumber(group.readiness)) : null,
  ].filter(Boolean);

  return (
    <Shell label={label} torn className={className}>
      <div className="flex h-full flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:gap-10">
        <div className="flex items-start justify-between gap-4 @3xl:shrink-0 @3xl:flex-col @3xl:justify-center">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="orb grid size-10 shrink-0 place-items-center text-ink">
              <Icon name="groups" size={18} className="rtl:-scale-x-100" />
            </span>
            <div className="min-w-0">
              <p className="text-small text-ink-soft">{label}</p>
              <Link to={groupHref(group)} className="block truncate text-[18px] leading-snug font-medium text-cream transition-colors hover:text-gold">
                <bdi>{group.shortName}</bdi>
              </Link>
            </div>
          </div>
          <div className="shrink-0 pt-0.5 text-end @3xl:ps-[52px] @3xl:text-start">
            <p className="text-small text-cream tabular-nums">{dates}</p>
            {hebrewDate ? <p className="text-caption text-ink-soft">{hebrewDate}</p> : null}
          </div>
        </div>

        <FlightPath
          days={underWay ? 0 : days}
          label={pathLabel}
          from={group.flight?.outbound?.from ?? copy.from}
          to={group.flight?.outbound?.to ?? placeOf(group.shortName)}
          takeOff={formatDayMonth(start, locale)}
          className="@3xl:min-w-0 @3xl:flex-1"
        >
          {figure}
          <p className="text-small text-cream">{unit}</p>
        </FlightPath>

        <div
          data-tear
          className="mt-auto flex flex-col gap-1.5 border-t border-dashed border-white/20 pt-3 text-small @3xl:mt-0 @3xl:max-w-[40%] @3xl:shrink-0 @3xl:border-t-0 @3xl:pt-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 @3xl:flex-col @3xl:items-start">
            <p className="text-ink-text tabular-nums">{stats.join(leadsCopy.separator)}</p>
            {after ? (
              <Link to={groupHref(after.group)} className="min-w-0 truncate text-ink-soft transition-colors hover:text-cream">
                {copy.then} · <bdi>{after.group.shortName}</bdi> · {groupDate(after.group, locale, false)}
              </Link>
            ) : null}
          </div>
          {eventFirst ? <EventLine event={eventFirst} today={today} /> : null}
        </div>
      </div>
    </Shell>
  );
}

/** On the stub: the nearest event, by name, and how soon it is. */
function EventLine({ event, today }: { event: TripAhead; today: string }) {
  const { leadsCopy } = useCopy();
  const copy = leadsCopy.nextTrip;
  const { days } = tripClock(event, today);
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-ink-soft">
      <Icon name="calendar" size={15} className="shrink-0 text-gold" />
      <span className="shrink-0">{copy.event}</span>
      <Link to={groupHref(event.group)} className="min-w-0 truncate text-cream transition-colors hover:text-gold">
        <bdi>{event.group.shortName}</bdi>
      </Link>
      <span className="shrink-0 whitespace-nowrap text-ink-text">· {copy.when(days)}</span>
    </p>
  );
}

/** "אומן · חנוכה" is a trip to אומן: the office names trips place first. Null when the name has no place part. */
function placeOf(shortName: string): string | null {
  const parts = shortName.split(/\s*·\s*/);
  return parts.length > 1 && parts[0] ? parts[0] : null;
}

/** The flight path's height in px; its width follows the card. */
const PATH_HEIGHT = 118;
/** Room at each end for the end points, and above the arc's peak for the plane. */
const PATH_INSET = 14;
const PATH_PEAK = 22;
// The plane icon's nose points up and to the right, 45° off the way the path runs.
const PLANE_HEADING = 45;

interface Point {
  x: number;
  y: number;
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The element's width as it changes, for drawing in pixels; the fallback until it's measured (and in tests). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * The flight tracker: an arc from home to the trip's place, and the plane on it as far along as the 30 days before
 * take-off have gone (at home while it's further off, landed on the day and while the trip is under way). Behind the
 * plane the arc is a gold trail, ahead of it a dotted line. The days to go sit under the arc. On the first view the
 * plane flies out to today's place; with Reduce Motion it's simply there.
 */
function FlightPath({
  days,
  label,
  from,
  to,
  takeOff,
  className,
  children,
}: {
  days: number;
  label: string;
  from: string;
  to: string | null;
  takeOff: string;
  className?: string;
  children: ReactNode;
}) {
  const { leadsCopy } = useCopy();
  const copy = leadsCopy.nextTrip;
  const reduceMotion = useReducedMotion();
  const trailId = `trail-${useId().replace(/:/g, "")}`;
  const [ref, width] = useWidth(320);
  const target = Math.min(1, Math.max(0, (RUN_UP_DAYS - days) / RUN_UP_DAYS));
  const progress = useMotionValue(reduceMotion ? target : 0);
  const [flown, setFlown] = useState(progress.get());
  useMotionValueEvent(progress, "change", setFlown);
  useEffect(() => {
    const flight = animate(progress, target, reduceMotion ? { duration: 0 } : { duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] });
    return () => flight.stop();
  }, [progress, target, reduceMotion]);

  // A quadratic curve peaks halfway between its ends' height and its control point's.
  const base = PATH_HEIGHT - PATH_INSET;
  const home = { x: PATH_INSET, y: base };
  const away = { x: Math.max(width - PATH_INSET, home.x + 1), y: base };
  const control = { x: (home.x + away.x) / 2, y: 2 * PATH_PEAK - base };
  // De Casteljau: the point at `flown`, the way the path runs there, and the part of the curve behind it.
  const near = lerp(home, control, flown);
  const far = lerp(control, away, flown);
  const plane = lerp(near, far, flown);
  const heading = (Math.atan2(far.y - near.y, far.x - near.x) * 180) / Math.PI + PLANE_HEADING;
  const whole = `M ${home.x} ${home.y} Q ${control.x} ${control.y} ${away.x} ${away.y}`;
  const behind = `M ${home.x} ${home.y} Q ${near.x} ${near.y} ${plane.x} ${plane.y}`;

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <div ref={ref} role="img" aria-label={label} className="relative" style={{ height: PATH_HEIGHT }}>
        {/* Drawn left to right; in Hebrew the whole drawing turns round, so the plane flies to the left. */}
        <svg aria-hidden="true" width={width} height={PATH_HEIGHT} viewBox={`0 0 ${width} ${PATH_HEIGHT}`} className="absolute inset-0 overflow-visible rtl:-scale-x-100">
          <defs>
            <linearGradient id={trailId} gradientUnits="userSpaceOnUse" x1={home.x} y1={0} x2={plane.x} y2={0}>
              <stop offset="0" stopColor="var(--color-gold)" stopOpacity={0.15} />
              <stop offset="1" stopColor="var(--color-gold)" />
            </linearGradient>
          </defs>
          <path d={whole} fill="none" stroke="rgb(255 255 255 / 0.28)" strokeWidth={1.6} strokeDasharray="0.1 7" strokeLinecap="round" />
          <path d={behind} fill="none" stroke={`url(#${trailId})`} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={home.x} cy={home.y} r={4.5} fill="var(--color-ink-soft)" />
          <circle cx={away.x} cy={away.y} r={7.5} fill="none" stroke="var(--color-gold)" strokeWidth={1.5} />
          <circle cx={away.x} cy={away.y} r={2.75} fill="var(--color-gold)" />
          <g transform={`translate(${plane.x} ${plane.y})`}>
            <circle r={23} fill="rgb(224 171 87 / 0.14)" />
            <circle r={16.5} fill="var(--color-gold)" />
            <g transform={`rotate(${heading}) translate(-9.6 -9.6) scale(0.8)`}>
              {(ICONS.groups as readonly string[]).map((shape) => (
                <path key={shape} d={shape} fill="none" stroke="var(--color-ink)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ top: PATH_PEAK + 26 }}>
          {children}
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 text-caption">
        <p className="text-ink-soft">{from}</p>
        <p className="text-end">
          {to ? <bdi className="text-cream">{to}</bdi> : null}
          {to ? " · " : null}
          <span className="text-ink-soft">{copy.takeOff}</span> <span className="text-cream tabular-nums">{takeOff}</span>
        </p>
      </div>
    </div>
  );
}

/** On phones, under the title: the next flight, how soon, and how full it is. A press opens the group. */
export function NextTripPill({ className }: { className?: string }) {
  const seesGroups = useCan("customers", "view");
  return seesGroups ? <TripPill className={className} /> : null;
}

function TripPill({ className }: { className?: string }) {
  const { leadsCopy } = useCopy();
  const copy = leadsCopy.nextTrip;
  const groups = useGroups();
  const today = isoDay(now());
  const flight = groups.data ? nextOnes(groups.data, today).flight : null;
  if (!flight) return null;
  const { group, underWay } = flight;
  const { days } = tripClock(flight, today);
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
        <Icon name="groups" size={15} className="rtl:-scale-x-100" />
      </span>
      <span className="sr-only">{underWay ? copy.underWay : copy.label}</span>
      <bdi className="min-w-0 truncate font-medium text-ink">{group.shortName}</bdi>
      <span className={cx("shrink-0 font-medium whitespace-nowrap", underWay || days <= 7 ? "text-status-talking-deep" : "text-copy")}>
        {underWay ? copy.underWay : copy.when(days)}
      </span>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-ink/15" />
      <span className="shrink-0 whitespace-nowrap text-copy tabular-nums">{seats}</span>
    </Link>
  );
}
