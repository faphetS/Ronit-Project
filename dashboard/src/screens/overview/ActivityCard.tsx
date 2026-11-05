import { useId } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useActivity } from "../../data/queries";
import { cx } from "../../lib/cx";
import { useFirstKeys } from "../../motion/cascade";
import { IconCircle } from "../../ui/IconCircle";
import { ListRow } from "../../ui/ListRow";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import type { Copy } from "../../content/copy";
import type { Activity } from "../../data/types";
import { formatNumber } from "../../lib/format";
import { ACTIVITY_ICON, SHOWN, isToday, timeOfDay } from "./overview-model";
import { RowsSkeleton } from "./OverviewStates";

/** A line of the feed in words: its title and the detail under it. */
function activityText(item: Activity, copy: Copy): { title: string; detail: string } {
  const text = copy.overview.activity;
  switch (item.kind) {
    case "lead":
      return { title: item.name, detail: text.lead(copy.leadsCopy.sources[item.source], item.service ? copy.leadsCopy.services[item.service] : null) };
    case "registration":
      return { title: item.name, detail: text.registration(item.group) };
    case "passport":
      return { title: item.name, detail: text.passport[item.result] };
    case "import":
      return { title: text.importTitle, detail: text.importDetail(formatNumber(item.leads), formatNumber(item.customers)) };
  }
}

/** The latest things that happened in the business, newest first: five on desktop, three on phones. */
export function ActivityCard({ phone, className }: { phone: boolean; className?: string }) {
  const allCopy = useCopy();
  const copy = allCopy.overview.activity;
  const { locale } = useLocale();
  const activity = useActivity();
  const headingId = useId();
  const count = phone ? SHOWN.activity.phone : SHOWN.activity.desktop;
  const items = activity.data?.slice(0, count) ?? [];
  const isFirst = useFirstKeys(items.map((item) => item.id));
  const allToday = items.length > 0 && items.every((item) => isToday(item.at));
  return (
    <Surface variant="card" compact={phone} aria-labelledby={headingId} className={className}>
      <SectionHeader id={headingId} title={copy.title} trailing={allToday ? copy.today : undefined} />
      {activity.isPending ? <RowsSkeleton rows={count} /> : null}
      {activity.isError && !activity.data ? <ErrorState onRetry={() => void activity.refetch()} /> : null}
      {activity.data && items.length === 0 ? <EmptyState message={copy.empty} /> : null}
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => {
            const { title, detail } = activityText(item, allCopy);
            return (
              <ListRow
                key={item.id}
                as="li"
                row={{ index, cascade: isFirst(item.id) }}
                leading={<IconCircle icon={ACTIVITY_ICON[item.kind]} />}
                // Names and trips are stored in Hebrew; <bdi> keeps their order in English too.
                title={<bdi>{title}</bdi>}
                titleClassName={phone ? "text-small" : undefined}
                description={<bdi className={phone ? undefined : "text-small"}>{detail}</bdi>}
                trailing={<span className={cx("shrink-0 text-mute", phone ? "text-caption" : "text-small")}>{timeOfDay(item.at, locale)}</span>}
              />
            );
          })}
        </ul>
      ) : null}
    </Surface>
  );
}
