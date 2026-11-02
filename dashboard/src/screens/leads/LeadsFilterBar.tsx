import { motion } from "motion/react";
import { useCopy } from "../../content/locale";
import { useLeadCounts } from "../../data/queries";
import type { LeadStatusFilter } from "../../data/services";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { cardVariants } from "../../motion/variants";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { CountPill } from "../../ui/CountPill";
import { Icon } from "../../ui/Icon";
import { SelectChip, type SelectChipOption } from "../../ui/SelectChip";
import { EmptyState } from "../../ui/states";
import { ALL, LEAD_SERVICES, LEAD_SOURCES, LEAD_STATUS_FILTERS, type LeadsUrlState } from "./leads-url";

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

interface LeadsFilterBarProps {
  id: string;
  /** Folded away by the "סינון" button. */
  hidden: boolean;
  /** The board has no status chips: its columns are the statuses. */
  showStatus: boolean;
  state: LeadsUrlState;
  onChange: (patch: Partial<LeadsUrlState>) => void;
}

/** Desktop filters: status chips at the start; source and service at the end. */
export function LeadsFilterBar({ id, hidden, showStatus, state, onChange }: LeadsFilterBarProps) {
  const { leadsCopy: copy } = useCopy();

  const sources: SelectChipOption<LeadsUrlState["source"]>[] = [
    { value: ALL, label: copy.filters.allSources },
    ...LEAD_SOURCES.map((source) => ({ value: source, label: copy.sources[source] })),
  ];
  const services: SelectChipOption<LeadsUrlState["service"]>[] = [
    { value: ALL, label: copy.filters.allServices },
    ...LEAD_SERVICES.map((service) => ({ value: service, label: copy.services[service] })),
  ];

  return (
    <motion.div
      id={id}
      hidden={hidden}
      variants={cardVariants}
      role="group"
      aria-label={copy.filters.label}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {showStatus ? <StatusChips value={state.status} onChange={(status) => onChange({ status })} /> : <span />}
      <div className="flex flex-wrap items-center gap-2">
        <SelectChip label={copy.filters.source} options={sources} value={state.source} onChange={(source) => onChange({ source })} />
        <SelectChip label={copy.filters.service} options={services} value={state.service} onChange={(service) => onChange({ service })} />
      </div>
    </motion.div>
  );
}

interface FilterToggleProps {
  open: boolean;
  /** The id of the filters it shows and hides. */
  controls: string;
  /** Filters in use, shown on the button while the filters are folded away. */
  activeCount: number;
  onToggle: () => void;
}

/** The outline "סינון" button in the header: shows and hides the filters row. */
export function FilterToggle({ open, controls, activeCount, onToggle }: FilterToggleProps) {
  const { leadsCopy: copy } = useCopy();
  return (
    <motion.button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className="inline-flex h-[46px] items-center gap-2 rounded-full px-[22px] text-[15px] leading-none font-medium whitespace-nowrap text-ink ring-1 ring-ink/28 transition-colors ring-inset hover:bg-white/65"
    >
      <Icon name="filter" size={16} />
      {copy.filter}
      {!open && activeCount > 0 ? <CountPill label={copy.activeFilters(activeCount)}>{activeCount}</CountPill> : null}
    </motion.button>
  );
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
