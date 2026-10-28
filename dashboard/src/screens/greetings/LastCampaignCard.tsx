import { useCopy, useLocale } from "../../content/locale";
import { useLastCampaign } from "../../data/queries";
import { dayAt } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDate, formatNumber } from "../../lib/format";
import { Button } from "../../ui/Button";
import { ProportionBar, type ProportionPart } from "../../ui/ProportionBar";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState, LoadingBlock } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { CAMPAIGN_TONE } from "./greetings-model";

interface LastCampaignCardProps {
  phone: boolean;
  className?: string;
}

/** The black card: how the last greeting did, read, delivered and failed. */
export function LastCampaignCard({ phone, className }: LastCampaignCardProps) {
  const { greetingsCopy, holidayNames } = useCopy();
  const { locale } = useLocale();
  const copy = greetingsCopy.holidays.last;
  const last = useLastCampaign();
  const campaign = last.data;
  const title = campaign ? copy.title(holidayNames[campaign.holiday]) : copy.titleNone;
  const stats = campaign?.stats;
  // "Delivered" in the bar means delivered and not read: the data's delivered count includes the read ones.
  const parts: ProportionPart[] = stats
    ? [
        { key: "read", label: copy.parts.read, value: stats.read, tone: "accent" },
        { key: "delivered", label: copy.parts.delivered, value: Math.max(0, stats.delivered - stats.read), tone: "neutral" },
        { key: "failed", label: copy.parts.failed, value: stats.failed, tone: "warning" },
      ]
    : [];

  return (
    <Surface variant="ink" compact={phone} aria-label={title} className={cx("flex flex-col", phone ? "gap-3" : "gap-4", className)}>
      <SectionHeader
        title={title}
        trailing={
          campaign ? (
            <StatusTag tone={CAMPAIGN_TONE[campaign.status]} onDark>
              {greetingsCopy.campaignStatus[campaign.status]}
            </StatusTag>
          ) : undefined
        }
        surface="ink"
        flush
      />
      {last.isPending ? <LoadingBlock lines={3} onDark /> : null}
      {last.isError && campaign === undefined ? <ErrorState onDark onRetry={() => void last.refetch()} /> : null}
      {campaign === null ? <EmptyState onDark message={copy.none} /> : null}
      {campaign && stats ? (
        <>
          {phone ? null : <p className="text-small text-ink-mute">{copy.summary(formatDate(dayAt(campaign.eve), locale), formatNumber(stats.sent))}</p>}
          <ProportionBar parts={parts} legend={phone ? "inline" : "figures"} compact={phone} surface="ink" />
          {phone || stats.failed === 0 ? null : (
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
              <p className="text-caption text-ink-mute">{copy.failedNote(stats.failed, formatNumber(stats.failed))}</p>
              {/* Resending failed greetings is not a service yet. */}
              <Button variant="outline" size="sm" onDark disabled>
                {copy.resend}
              </Button>
            </div>
          )}
        </>
      ) : null}
    </Surface>
  );
}
