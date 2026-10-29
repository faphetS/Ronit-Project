import { useCopy, useLocale } from "../../content/locale";
import { useCampaignHistory } from "../../data/queries";
import type { HolidayCampaign } from "../../data/types";
import { dayAt } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDate, formatNumber } from "../../lib/format";
import { CARD_PAGE_SIZE, DataTable, type DataColumn } from "../../ui/DataTable";
import { ListRow } from "../../ui/ListRow";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState, LoadingBlock } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { CAMPAIGN_TONE, hebrewYearLabel } from "./greetings-model";

interface CampaignHistoryProps {
  phone: boolean;
  className?: string;
}

/** Every greeting, newest first: a table on desktop, a list on phones. The rail's history tool lands here (#history). */
export function CampaignHistory({ phone, className }: CampaignHistoryProps) {
  const { greetingsCopy, holidayNames } = useCopy();
  const { locale } = useLocale();
  const holidays = greetingsCopy.holidays;
  const copy = holidays.history;
  const history = useCampaignHistory();
  const campaigns = history.data;

  const name = (campaign: HolidayCampaign) => holidays.campaignName(holidayNames[campaign.holiday], hebrewYearLabel(campaign.hebrewYear, locale));
  // A greeting that has not gone out is dated by its eve, as on the board.
  const date = (campaign: HolidayCampaign) => (campaign.stats ? formatDate(dayAt(campaign.eve), locale) : copy.eve);
  const status = (campaign: HolidayCampaign) => (
    <StatusTag tone={CAMPAIGN_TONE[campaign.status]}>{greetingsCopy.campaignStatus[campaign.status]}</StatusTag>
  );
  const figure = (value: number | undefined) =>
    value === undefined ? (
      <>
        <span aria-hidden="true" className="text-mute">
          {copy.blank}
        </span>
        <span className="sr-only">{copy.notYet}</span>
      </>
    ) : (
      formatNumber(value)
    );

  const columns: DataColumn<HolidayCampaign>[] = [
    { key: "holiday", header: copy.columns.holiday, isRowHeader: true, cell: (row) => <span className="font-medium text-ink">{name(row)}</span> },
    { key: "date", header: copy.columns.date, cell: date },
    { key: "sent", header: copy.columns.sent, cell: (row) => figure(row.stats?.sent) },
    { key: "delivered", header: copy.columns.delivered, cell: (row) => figure(row.stats?.delivered) },
    { key: "read", header: copy.columns.read, cell: (row) => figure(row.stats?.read) },
    { key: "status", header: copy.columns.status, cell: status },
  ];

  return (
    <Surface variant="card" compact={phone} id="history" tabIndex={-1} aria-label={copy.title} className={cx("scroll-mt-3", className)}>
      <SectionHeader title={copy.title} trailing={copy.note} />
      {history.isPending ? <LoadingBlock lines={5} /> : null}
      {history.isError && campaigns === undefined ? <ErrorState onRetry={() => void history.refetch()} /> : null}
      {campaigns && campaigns.length === 0 ? <EmptyState message={copy.empty} /> : null}
      {campaigns && campaigns.length > 0 ? (
        phone ? (
          <ul>
            {campaigns.map((campaign) => (
              <ListRow
                key={campaign.id}
                as="li"
                title={name(campaign)}
                description={
                  campaign.stats
                    ? copy.phoneLine(date(campaign), formatNumber(campaign.stats.sent), formatNumber(campaign.stats.read))
                    : date(campaign)
                }
                trailing={status(campaign)}
              />
            ))}
          </ul>
        ) : (
          <DataTable label={copy.table} columns={columns} rows={campaigns} rowKey={(campaign) => campaign.id} pageSize={CARD_PAGE_SIZE} />
        )
      ) : null}
    </Surface>
  );
}
