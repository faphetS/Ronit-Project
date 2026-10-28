import { useId } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useGroups, useLeads } from "../../data/queries";
import type { Lead } from "../../data/types";
import { now } from "../../lib/clock";
import { formatRelative } from "../../lib/format";
import { DataTable, type DataColumn } from "../../ui/DataTable";
import { PersonCell } from "../../ui/PersonCell";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { LEAD_TONE, SHOWN, initialOf } from "./overview-model";
import { TableSkeleton } from "./OverviewStates";

/** The latest open leads, newest update first. Each row opens the lead. Desktop only, as on the board. */
export function RecentLeadsCard({ className }: { className?: string }) {
  const { overview, leadsCopy } = useCopy();
  const copy = overview.leads;
  const { locale } = useLocale();
  const leads = useLeads();
  const groups = useGroups();
  const headingId = useId();
  const groupNames = new Map<string, string>(groups.data?.map((group) => [group.id, group.shortName] as const) ?? []);
  const reference = now();

  const columns: DataColumn<Lead>[] = [
    {
      key: "name",
      header: copy.columns.name,
      isRowHeader: true,
      cell: (lead) => <PersonCell name={lead.name} initial={initialOf(lead.name)} to={`/leads/${lead.id}`} />,
    },
    {
      key: "group",
      header: copy.columns.group,
      cell: (lead) => (lead.groupId ? (groupNames.get(lead.groupId) ?? null) : <span className="text-mute">{copy.noGroup}</span>),
    },
    { key: "source", header: copy.columns.source, cell: (lead) => overview.sources[lead.source] },
    {
      key: "status",
      header: copy.columns.status,
      cell: (lead) => <StatusTag tone={LEAD_TONE[lead.status]}>{leadsCopy.status[lead.status]}</StatusTag>,
    },
    {
      key: "updated",
      header: copy.columns.updated,
      className: "text-mute",
      cell: (lead) => formatRelative(new Date(lead.updatedAt), reference, locale),
    },
  ];

  return (
    <Surface variant="card" aria-labelledby={headingId} className={className}>
      <SectionHeader id={headingId} title={copy.title} trailing={<TextLink to="/leads">{copy.all}</TextLink>} />
      {leads.isPending ? <TableSkeleton rows={SHOWN.leads} /> : null}
      {leads.isError && !leads.data ? <ErrorState onRetry={() => void leads.refetch()} /> : null}
      {leads.data ? (
        <DataTable
          label={copy.title}
          columns={columns}
          rows={leads.data.slice(0, SHOWN.leads)}
          rowKey={(lead) => lead.id}
          rowHref={(lead) => `/leads/${lead.id}`}
          animateRows={false}
          empty={<EmptyState message={copy.empty} />}
        />
      ) : null}
    </Surface>
  );
}
