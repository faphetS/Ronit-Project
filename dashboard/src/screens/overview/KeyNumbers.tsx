import { useCopy } from "../../content/locale";
import type { OverviewStats } from "../../data/types";
import { BigNumber } from "../../ui/BigNumber";
import { Skeleton } from "../../ui/states";

const NUMBER_KEYS = ["openLeads", "customers", "activeGroups"] as const;

/** The three key numbers beside the desktop greeting. If they fail to load, the black card offers the retry. */
export function KeyNumbers({ stats, loading }: { stats: OverviewStats | undefined; loading: boolean }) {
  const { overview: copy } = useCopy();
  if (!stats && !loading) return null;
  return (
    <dl aria-label={copy.numbersLabel} className="flex gap-8 pb-1.5">
      {NUMBER_KEYS.map((key) => (
        <div key={key}>
          <dt className="text-caption text-mute">{copy.numbers[key]}</dt>
          {stats ? (
            <BigNumber as="dd" value={stats[key]} size={38} className="mt-1" />
          ) : (
            <dd className="mt-1">
              <Skeleton className="h-9 w-14" />
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
