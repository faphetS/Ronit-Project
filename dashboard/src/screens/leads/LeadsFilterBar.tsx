import { useCopy } from "../../content/locale";
import { useLeadCounts } from "../../data/queries";
import type { LeadStatusFilter } from "../../data/services";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { EmptyState } from "../../ui/states";
import { LEAD_STATUS_FILTERS } from "./leads-url";

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
