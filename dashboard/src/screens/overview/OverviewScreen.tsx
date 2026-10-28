import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { overview as copy } from "../../content/overview.he";
import { useOverview } from "../../data/queries";
import { today } from "../../lib/clock";
import { formatNumber } from "../../lib/format";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { EmptyState, ErrorState, LoadingBlock } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { TodayCard } from "../shared/TodayCard";

const NUMBER_KEYS = ["openLeads", "customers", "activeGroups"] as const;

/** The overview, first version: greeting, key numbers, this week's leads and today. The rest comes later. */
export function OverviewScreen() {
  const phone = useShell() === "phone";
  const stats = useOverview();
  const data = stats.data;
  return (
    <ScreenFrame>
      {phone ? <PhoneTopBar /> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <Headline title={copy.title} soft={phone ? copy.softPhone : copy.soft} size={phone ? "display-2" : "display"} />
        <dl aria-label={copy.numbersLabel} className="flex gap-8 pb-1.5">
          {NUMBER_KEYS.map((key) => (
            <div key={key}>
              <dt className="text-caption text-mute">{copy.numbers[key]}</dt>
              <dd className="mt-1 text-[38px] leading-none font-light text-ink">{data ? formatNumber(data[key]) : copy.pending}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-12 lg:gap-5">
        <Surface variant="ink" compact={phone} aria-label={copy.weekTitle} className="flex flex-col gap-4 lg:col-span-5">
          <h2 className="text-title font-medium text-cream">{copy.weekTitle}</h2>
          {stats.isPending ? <LoadingBlock lines={2} onDark /> : null}
          {stats.isError ? <ErrorState onDark onRetry={() => void stats.refetch()} /> : null}
          {data ? (
            <>
              <div className="flex items-end gap-4">
                <p className="text-[92px] leading-[0.95] font-light text-cream">{formatNumber(data.newLeadsThisWeek)}</p>
                <p className="pb-2.5 text-small text-ink-mute">{copy.breakdown(data.thisWeekByStatus)}</p>
              </div>
              <GooButton to="/leads" tone="light" size="sm" className="mt-auto self-end">
                {copy.allLeads}
              </GooButton>
            </>
          ) : null}
        </Surface>
        <TodayCard
          day={today()}
          label={copy.today}
          size={phone ? "compact" : "regular"}
          className="min-h-[300px] lg:col-span-4"
          side={<p className="text-small text-mute">{copy.sideNote}</p>}
        />
        <Surface variant="glass" compact={phone} aria-label={copy.restTitle} className="lg:col-span-3">
          <EmptyState message={copy.rest} />
        </Surface>
      </div>
    </ScreenFrame>
  );
}
