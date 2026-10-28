import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { useCopy } from "../../content/locale";
import { useGroups } from "../../data/queries";
import type { Lead, LeadStatus } from "../../data/types";
import { cx } from "../../lib/cx";
import { fadeOut, springs } from "../../motion/springs";
import { cardVariants } from "../../motion/variants";
import { CountPill } from "../../ui/CountPill";
import { MotionLink } from "../../ui/MotionLink";
import { ErrorState, Skeleton } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { LeadsEmpty } from "./LeadsFilterBar";
import type { LeadsListProps } from "./LeadsTable";
import { useSettledLeads } from "./leads-data";
import { STATUS_DOT, STATUS_ORDER } from "./leads-model";

/**
 * The board view: one column per status, each holding lead cards (name, trip, last note). A card opens the lead;
 * statuses change in the detail, there is no dragging. Narrow screens scroll the columns sideways.
 */
export function LeadsBoardView({ filters, selectedId, leadHref, filtered, onClear }: LeadsListProps) {
  const { leadsCopy: copy } = useCopy();
  // The pipeline comes without the irrelevant leads; they have their own request.
  const open = useSettledLeads(filters);
  const closed = useSettledLeads({ ...filters, status: "not-relevant" });
  const groups = useGroups();
  const groupList = groups.data;

  if (open.isError || closed.isError || (!groupList && groups.isError)) {
    const retry = () => {
      void open.refetch();
      void closed.refetch();
      void groups.refetch();
    };
    return (
      <Surface variant="glass" aria-label={copy.board.label}>
        <ErrorState onRetry={retry} />
      </Surface>
    );
  }
  if (!open.data || !closed.data || !groupList) return <LeadsBoardSkeleton />;
  if (filtered && open.data.length + closed.data.length === 0) {
    return (
      <Surface variant="glass" aria-label={copy.board.label}>
        <LeadsEmpty filtered onClear={onClear} />
      </Surface>
    );
  }

  const trips = new Map(groupList.map((group) => [group.id, group.shortName]));
  const tripOf = (lead: Lead) => (lead.groupId ? trips.get(lead.groupId) : undefined) ?? copy.noGroup;
  const closedLeads = closed.data;
  const openLeads = open.data;
  return (
    <section
      aria-label={copy.board.label}
      aria-busy={open.isUpdating || closed.isUpdating || undefined}
      className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
    >
      <div className="grid min-w-[780px] grid-cols-5 items-start gap-3">
        {STATUS_ORDER.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            leads={status === "not-relevant" ? closedLeads : openLeads.filter((lead) => lead.status === status)}
            tripOf={tripOf}
            selectedId={selectedId}
            leadHref={leadHref}
          />
        ))}
      </div>
    </section>
  );
}

interface BoardColumnProps {
  status: LeadStatus;
  leads: Lead[];
  tripOf: (lead: Lead) => string;
  selectedId?: string;
  leadHref: (id: string) => string;
}

function BoardColumn({ status, leads, tripOf, selectedId, leadHref }: BoardColumnProps) {
  const { leadsCopy: copy } = useCopy();
  const headingId = useId();
  return (
    <motion.section variants={cardVariants} aria-labelledby={headingId} className="surface-glass flex min-w-0 flex-col gap-2 rounded-card p-2.5">
      <h2 id={headingId} className="flex items-center gap-2 px-2 pt-1.5 pb-1 text-[14px] font-medium text-ink">
        <span aria-hidden="true" className={cx("size-[7px] shrink-0 rounded-full", STATUS_DOT[status])} />
        <span className="min-w-0 truncate">{copy.filters.statusOptions[status]}</span>
        <CountPill label={copy.leadCount(leads.length)} className="ms-auto">
          {leads.length}
        </CountPill>
      </h2>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {leads.map((lead) => {
            const selected = lead.id === selectedId;
            return (
              <motion.li
                key={lead.id}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: fadeOut }}
                transition={springs.surface}
              >
                <MotionLink
                  to={leadHref(lead.id)}
                  aria-current={selected ? "page" : undefined}
                  whileHover={{ y: -3 }}
                  transition={springs.ui}
                  className={cx("block rounded-inner p-3.5 shadow-card transition-colors", selected ? "bg-cream ring-1 ring-ink/15 ring-inset" : "bg-paper")}
                >
                  <span className="block font-medium break-words text-ink">{lead.name}</span>
                  <span className="mt-0.5 block text-caption text-mute">{tripOf(lead)}</span>
                  <span className="mt-2 line-clamp-2 text-caption break-words text-copy">{lead.lastNote}</span>
                </MotionLink>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {leads.length === 0 ? <p className="px-2 pb-2 text-caption text-mute">{copy.board.empty}</p> : null}
    </motion.section>
  );
}

/** Five columns of card outlines. */
function LeadsBoardSkeleton() {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className="-mx-1 overflow-hidden px-1">
      <span className="sr-only">{states.loading}</span>
      <div aria-hidden="true" className="grid min-w-[780px] grid-cols-5 items-start gap-3">
        {[3, 3, 2, 2, 1].map((cards, column) => (
          <div key={column} className="surface-glass flex flex-col gap-2 rounded-card p-2.5">
            <Skeleton className="mx-2 my-2 h-4 w-20" />
            {Array.from({ length: cards }, (_, card) => (
              <div key={card} className="flex flex-col gap-2 rounded-inner bg-paper p-3.5 shadow-card">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
