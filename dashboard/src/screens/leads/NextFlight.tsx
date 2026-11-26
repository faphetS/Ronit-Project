import { Link } from "react-router";
import { useCopy } from "../../content/locale";
import { useCan, useGroups } from "../../data/queries";
import { dayAt, daysBetween, isoDay, now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatNumber } from "../../lib/format";
import { Icon } from "../../ui/Icon";
import { nextFlight } from "./leads-model";

/**
 * The next flight beside the leads' title: its name, how many days until it leaves, and how full it is; a press opens
 * the group. Only for people who may see groups, so nobody else's screen asks for them.
 */
export function NextFlight({ className }: { className?: string }) {
  // Groups sit under customers in the role table.
  const seesGroups = useCan("customers", "view");
  return seesGroups ? <NextFlightPill className={className} /> : null;
}

function NextFlightPill({ className }: { className?: string }) {
  const { leadsCopy: copy } = useCopy();
  const groups = useGroups();
  const today = isoDay(now());
  const flight = groups.data ? nextFlight(groups.data, today) : null;
  if (!flight?.startsOn) return null;
  const days = daysBetween(dayAt(today), dayAt(flight.startsOn));
  const seats =
    flight.capacity !== null
      ? copy.nextFlight.seats(formatNumber(flight.registered), formatNumber(flight.capacity))
      : copy.nextFlight.registered(formatNumber(flight.registered));
  const soon = days <= 7;
  return (
    <Link
      to={`/groups/${flight.id}`}
      className={cx(
        "group inline-flex h-11 max-w-full items-center gap-2.5 rounded-full bg-white/55 ps-1.5 pe-4 text-[14px] ring-1 ring-white/85 ring-inset transition-colors hover:bg-white lg:h-10",
        className,
      )}
    >
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-cream lg:size-7">
        <Icon name="groups" size={15} />
      </span>
      <span className="shrink-0 text-mute max-lg:sr-only">{copy.nextFlight.label}</span>
      <bdi className="min-w-0 truncate font-medium text-ink">{flight.shortName}</bdi>
      <span className={cx("shrink-0 font-medium whitespace-nowrap", soon ? "text-status-talking-deep" : "text-copy")}>{copy.nextFlight.when(days)}</span>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-ink/15" />
      <span className="shrink-0 whitespace-nowrap text-copy tabular-nums">{seats}</span>
    </Link>
  );
}
