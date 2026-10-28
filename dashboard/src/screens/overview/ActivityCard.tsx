import { useId } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useActivity } from "../../data/queries";
import { cx } from "../../lib/cx";
import { IconCircle } from "../../ui/IconCircle";
import { ListRow } from "../../ui/ListRow";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { ACTIVITY_ICON, SHOWN, isToday, timeOfDay } from "./overview-model";
import { RowsSkeleton } from "./OverviewStates";

/** The latest things that happened in the business, newest first: five on desktop, three on phones. */
export function ActivityCard({ phone, className }: { phone: boolean; className?: string }) {
  const { overview } = useCopy();
  const copy = overview.activity;
  const { locale } = useLocale();
  const activity = useActivity();
  const headingId = useId();
  const count = phone ? SHOWN.activity.phone : SHOWN.activity.desktop;
  const items = activity.data?.slice(0, count) ?? [];
  const allToday = items.length > 0 && items.every((item) => isToday(item.at));
  return (
    <Surface variant="card" compact={phone} aria-labelledby={headingId} className={className}>
      <SectionHeader id={headingId} title={copy.title} trailing={allToday ? copy.today : undefined} />
      {activity.isPending ? <RowsSkeleton rows={count} /> : null}
      {activity.isError && !activity.data ? <ErrorState onRetry={() => void activity.refetch()} /> : null}
      {activity.data && items.length === 0 ? <EmptyState message={copy.empty} /> : null}
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <ListRow
              key={item.id}
              as="li"
              leading={<IconCircle icon={ACTIVITY_ICON[item.kind]} />}
              // Titles and details are stored text in Hebrew; <bdi> keeps their order in English too.
              title={<bdi>{item.title}</bdi>}
              titleClassName={phone ? "text-small" : undefined}
              description={<bdi className={phone ? undefined : "text-small"}>{item.detail}</bdi>}
              trailing={<span className={cx("shrink-0 text-mute", phone ? "text-caption" : "text-small")}>{timeOfDay(item.at, locale)}</span>}
            />
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}
