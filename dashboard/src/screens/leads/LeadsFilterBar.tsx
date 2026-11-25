import { useCopy } from "../../content/locale";
import { useLeadCounts } from "../../data/queries";
import type { LeadStatusFilter } from "../../data/services";
import { cx } from "../../lib/cx";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { Icon } from "../../ui/Icon";
import { EmptyState } from "../../ui/states";
import { LEAD_STATUS_FILTERS } from "./leads-url";

/** "@ תויגתי": a toggle for the leads whose notes tag the signed-in person. Shaped like the source and service chips. */
export function TaggedMeChip({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cx(
        "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-colors lg:h-10",
        on ? "bg-ink text-cream" : "bg-white/55 text-copy ring-1 ring-white/85 ring-inset hover:bg-white",
      )}
    >
      <Icon name="at" size={16} className={on ? "text-gold" : undefined} />
      {copy.filters.taggedMe}
    </button>
  );
}

interface StatusChipsProps {
  value: LeadStatusFilter;
  onChange: (value: LeadStatusFilter) => void;
  /** One sideways-scrolling line, on phones. */
  scroll?: boolean;
}

/** "הכל 24 · חדשים 6 · …": the status filter with each status's count. The counts appear once they load. */
export function StatusChips({ value, onChange, scroll = false }: StatusChipsProps) {
  const { leadsCopy: copy } = useCopy();
  const counts = useLeadCounts();
  const options = LEAD_STATUS_FILTERS.map((status) => ({ value: status, label: copy.filters.statusOptions[status], count: counts.data?.[status] }));
  return <ChipGroup id="lead-status-filter" label={copy.filters.status} options={options} value={value} onChange={onChange} scroll={scroll} />;
}

/** No leads: with filters on, say so and offer to clear them. */
export function LeadsEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <EmptyState
      message={filtered ? copy.empty.filtered : copy.empty.none}
      action={
        filtered ? (
          <Button variant="outline" size="sm" onClick={onClear}>
            {copy.filters.clear}
          </Button>
        ) : undefined
      }
    />
  );
}
