import { useId } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useOverview } from "../../data/queries";
import { cx } from "../../lib/cx";
import { BigNumber } from "../../ui/BigNumber";
import { GooButton } from "../../ui/GooButton";
import { StatusTag } from "../../ui/StatusTag";
import { ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { WeekBars } from "../../ui/WeekBars";
import { useMinutesSince, weekBars } from "./overview-model";
import { WeekSkeleton } from "./OverviewStates";

/** The black card: new leads this week against last week, the 8-week bars, and the way to all leads. */
export function WeekCard({ phone, className }: { phone: boolean; className?: string }) {
  const { overview: copy } = useCopy();
  const { locale } = useLocale();
  const stats = useOverview();
  const headingId = useId();
  const minutesAgo = useMinutesSince(stats.dataUpdatedAt);
  const data = stats.data;
  const difference = data ? data.newLeadsThisWeek - data.newLeadsLastWeek : 0;
  return (
    <Surface variant="ink" compact={phone} aria-labelledby={headingId} className={cx("flex flex-col", phone ? "gap-3" : "gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={headingId} className="text-title font-medium text-cream">
          {copy.weekTitle}
        </h2>
        {data ? (
          <StatusTag tone={difference > 0 ? "new" : "neutral"} onDark>
            {copy.versusLastWeek(difference)}
          </StatusTag>
        ) : null}
      </div>
      {stats.isPending ? <WeekSkeleton phone={phone} /> : null}
      {stats.isError && !data ? <ErrorState onDark onRetry={() => void stats.refetch()} /> : null}
      {data ? (
        <>
          <div className={cx("flex items-end", phone ? "gap-3.5" : "gap-4")}>
            <BigNumber value={data.newLeadsThisWeek} size={phone ? 72 : 92} surface="ink" countUp />
            <p className={cx("text-small text-ink-mute", phone ? "pb-1.5" : "pb-2.5")}>
              {copy.newLeads}{" "}
              <br />
              {copy.breakdown(data.thisWeekByStatus)}
            </p>
          </div>
          <WeekBars
            bars={weekBars(data.weeklyLeads, locale, copy.thisWeek)}
            label={copy.weeklyChart(data.weeklyLeads.length)}
            surface="ink"
            compact={phone}
            className={phone ? "mt-2" : "mt-3.5"}
          />
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-ink-mute">{phone ? copy.lastWeeks(data.weeklyLeads.length) : copy.updated(minutesAgo)}</p>
            <GooButton to="/leads" tone="light" size="sm" className="focus-visible:outline-cream">
              {phone ? copy.toLeads : copy.allLeads}
            </GooButton>
          </div>
        </>
      ) : null}
    </Surface>
  );
}
