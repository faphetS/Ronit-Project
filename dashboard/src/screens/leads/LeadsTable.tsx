import { useCopy, useLocale } from "../../content/locale";
import { useGroups } from "../../data/queries";
import type { LeadFilters } from "../../data/services";
import type { Lead } from "../../data/types";
import { now } from "../../lib/clock";
import { formatRelative, maskPhone } from "../../lib/format";
import { CARD_PAGE_SIZE, DataTable, type DataColumn, type DataRowGroup } from "../../ui/DataTable";
import { Ltr } from "../../ui/Ltr";
import { PersonCell } from "../../ui/PersonCell";
import { ErrorState, Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { LeadsEmpty } from "./LeadsFilterBar";
import { useSettledLeads } from "./leads-data";
import { groupByTrip, initialOf, STATUS_TONE, tripWhen } from "./leads-model";

export interface LeadsListProps {
  filters: LeadFilters;
  /** The lead open in the side panel. */
  selectedId?: string;
  leadHref: (id: string) => string;
  /** Filters are on, so an empty result offers to clear them. */
  filtered: boolean;
  onClear: () => void;
}

/** The white card with the leads table, grouped by trip, as on the Leads board. */
export function LeadsTableView({ filters, selectedId, leadHref, filtered, onClear }: LeadsListProps) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const leads = useSettledLeads(filters);
  const groups = useGroups();
  const groupList = groups.data;
  const failed = leads.isError || (!groupList && groups.isError);
  const reference = now();

  const columns: DataColumn<Lead>[] = [
    {
      key: "name",
      header: copy.table.name,
      isRowHeader: true,
      wrap: true,
      cell: (lead) => <PersonCell name={lead.name} initial={initialOf(lead.name)} detail={lead.lastNote} to={leadHref(lead.id)} />,
    },
    { key: "phone", header: copy.table.phone, cell: (lead) => <Ltr>{maskPhone(lead.phone)}</Ltr> },
    { key: "source", header: copy.table.source, cell: (lead) => copy.sources[lead.source] },
    { key: "status", header: copy.table.status, cell: (lead) => <StatusTag tone={STATUS_TONE[lead.status]}>{copy.status[lead.status]}</StatusTag> },
    { key: "updated", header: copy.table.updated, className: "text-mute", cell: (lead) => formatRelative(new Date(lead.updatedAt), reference, locale) },
  ];

  let body;
  if (failed)
    body = (
      <ErrorState
        onRetry={() => {
          void leads.refetch();
          void groups.refetch();
        }}
      />
    );
  else if (!leads.data || !groupList) body = <LeadsTableSkeleton />;
  else {
    const trips: DataRowGroup<Lead>[] = groupByTrip(leads.data, groupList).map((trip) => ({
      key: trip.key,
      title: trip.group?.name ?? copy.noGroup,
      count: trip.leads.length,
      meta: trip.group ? tripWhen(trip.group, locale, copy.departs) : undefined,
      rows: trip.leads,
    }));
    body = (
      <DataTable
        label={copy.table.label}
        columns={columns}
        groups={trips}
        rowKey={(lead) => lead.id}
        rowHref={(lead) => leadHref(lead.id)}
        selectedKey={selectedId ?? null}
        empty={<LeadsEmpty filtered={filtered} onClear={onClear} />}
        pageSize={CARD_PAGE_SIZE}
        pageResetKey={JSON.stringify(filters)}
      />
    );
  }

  return (
    <Surface variant="card" aria-label={copy.table.label} aria-busy={leads.isUpdating || undefined} className="pt-3">
      {body}
    </Surface>
  );
}

/** Shaped like the table: the column headings, then two trips of rows. */
function LeadsTableSkeleton() {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{states.loading}</span>
      <div aria-hidden="true">
        <div className="flex gap-10 px-0.5 pb-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
        </div>
        {[5, 4].map((rows, trip) => (
          <div key={trip}>
            <div className="flex items-center gap-3 px-0.5 pt-[22px] pb-2.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-[22px] w-6" />
            </div>
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center gap-6 border-t border-line px-0.5 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Skeleton className="size-[38px] shrink-0" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3.5 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
