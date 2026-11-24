import { useCopy } from "../../content/locale";
import { useCan } from "../../data/queries";
import type { Lead } from "../../data/types";
import { Icon } from "../../ui/Icon";
import { StatusTag } from "../../ui/StatusTag";
import { columnOf, STATUS_CHOICES, STATUS_TONE } from "./leads-model";
import { useChangeLeadStatus } from "./useChangeLeadStatus";

/**
 * The lead's status in its header. People who may change statuses get a menu of the board's five columns: a native
 * select, so the keyboard, screen readers and the phone's own picker all work. Everyone else sees the status tag.
 */
export function LeadStatusControl({ lead }: { lead: Lead }) {
  const { leadsCopy: copy } = useCopy();
  const canChange = useCan("leads", "full");
  const changeStatus = useChangeLeadStatus();
  if (!canChange) return <StatusTag tone={STATUS_TONE[lead.status]}>{copy.status[lead.status]}</StatusTag>;
  const current = columnOf(lead.status);
  return (
    <span className="relative inline-flex shrink-0">
      <select
        aria-label={copy.detail.statusLabel}
        value={current}
        onChange={(event) => {
          const choice = STATUS_CHOICES.find((option) => option.target === event.target.value);
          if (choice && choice.target !== current) changeStatus(lead, choice.status);
        }}
        className="h-9 cursor-pointer appearance-none rounded-full bg-sand-light ps-3.5 pe-9 text-[13px] font-medium text-ink transition-colors hover:bg-sand"
      >
        {STATUS_CHOICES.map((option) => (
          // Options keep their own colors: some systems paint the open list with the select's colors.
          <option key={option.target} value={option.target} className="bg-paper text-ink">
            {copy.board.columns[option.target]}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-copy">
        <Icon name="chevronDown" size={14} />
      </span>
    </span>
  );
}
