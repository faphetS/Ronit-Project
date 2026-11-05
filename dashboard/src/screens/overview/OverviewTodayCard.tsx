import type { ReactNode } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useLeads, useMaySee } from "../../data/queries";
import { isoDay, now, today } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatWeekday } from "../../lib/format";
import { formatHebrewDate } from "../../lib/hebrew";
import { GooButton } from "../../ui/GooButton";
import { OrbCard } from "../../ui/OrbCard";
import { Skeleton } from "../../ui/states";
import { todaysLeadLines } from "./overview-model";
import { InlineRetry, LinesSkeleton } from "./OverviewStates";

// Orb sizes and places from the boards: Main (desktop) and Mobile-Home.
const LAYOUT = {
  desktop: { orb: { size: 220, end: 66, top: 74 }, stripBasis: "55%", minHeight: "min-h-[330px]" },
  phone: { orb: { size: 180, end: 90, top: 38 }, stripBasis: "50%", minHeight: "min-h-[262px]" },
} as const;

/**
 * Every lead that came in today: the open ones and the not-relevant ones, under the same queries the leads board
 * opens with, so the board shows them at once from here.
 */
function useTodaysLeads() {
  const day = isoDay(now());
  const open = useLeads({ day });
  const closed = useLeads({ day, status: "not-relevant" });
  const data = open.data && closed.data ? [...open.data, ...closed.data] : undefined;
  return {
    data,
    isError: data === undefined && (open.isError || closed.isError),
    refetch: () => {
      if (open.isError) void open.refetch();
      if (closed.isError) void closed.refetch();
    },
  };
}

/** Under the date: how many leads came in today, and from where. */
function TodaysLeadLines({ phone }: { phone: boolean }) {
  const { overview: copy } = useCopy();
  const leads = useTodaysLeads();
  if (leads.data) {
    const lines = todaysLeadLines(leads.data, copy);
    return (
      <>
        <p className={cx("font-medium text-ink", phone && "text-small")}>{lines.title}</p>
        {lines.sources ? <p className={cx("text-mute-2", phone ? "text-caption" : "text-small")}>{lines.sources}</p> : null}
      </>
    );
  }
  if (leads.isError) return <InlineRetry onRetry={leads.refetch} />;
  return <LinesSkeleton widths={["w-32", "w-28"]} />;
}

/** Beside the orb: how many of today's leads still wait for someone, and the way to the leads. */
function TodaysLeadSide({ phone }: { phone: boolean }) {
  const { overview: copy } = useCopy();
  const leads = useTodaysLeads();
  const sideText = cx("text-mute", phone ? "text-caption" : "text-small");
  const waiting = leads.data ? todaysLeadLines(leads.data, copy).waiting : null;

  let line: ReactNode = null;
  if (waiting) {
    line = phone ? (
      <p className={sideText}>{waiting}</p>
    ) : (
      <p className={sideText}>
        {copy.sideNote}{" "}
        <br />
        {waiting}
      </p>
    );
  } else if (!leads.data && !leads.isError) {
    line = (
      <div className="flex flex-col items-end gap-2">
        {phone ? null : <p className={sideText}>{copy.sideNote}</p>}
        <Skeleton className="h-3.5 w-24" />
      </div>
    );
  }

  return (
    <>
      {line}
      {/* mt-auto keeps the button at the bottom on a day without leads, when it's alone. */}
      <GooButton to={phone ? "/leads?status=new" : "/leads"} size="sm" className="mt-auto">
        {phone ? copy.newLeadsLink : copy.todaysLeadsLink}
      </GooButton>
    </>
  );
}

/** The orb card for today: the date, the Hebrew date, and today's leads for those who may see leads. */
export function OverviewTodayCard({ phone, className }: { phone: boolean; className?: string }) {
  const { overview: copy } = useCopy();
  const { locale } = useLocale();
  const seesLeads = useMaySee("leads");
  const layout = LAYOUT[phone ? "phone" : "desktop"];
  const day = today();

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
          {seesLeads ? <TodaysLeadLines phone={phone} /> : null}
        </>
      }
      side={seesLeads ? <TodaysLeadSide phone={phone} /> : null}
    />
  );
}
