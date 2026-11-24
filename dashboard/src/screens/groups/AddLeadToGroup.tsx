import { useState } from "react";
import { useCopy } from "../../content/locale";
import { useAddLeadToGroup, useLeads } from "../../data/queries";
import type { Lead } from "../../data/types";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Ltr } from "../../ui/Ltr";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { useToast } from "../../ui/toast-context";

const MIN_CHARS = 2;
const MAX_RESULTS = 8;

/** Finds a lead by name or phone and registers her in this group, making her customer card if she has none. */
export function AddLeadToGroup({ groupId }: { groupId: string }) {
  const { groupsCopy: copy, leadsCopy } = useCopy();
  const text = copy.manage.addLead;
  const [term, setTerm] = useState("");
  const search = term.trim();
  const searching = search.length >= MIN_CHARS;
  const leads = useLeads({ search: searching ? search : undefined });
  const add = useAddLeadToGroup();
  const toast = useToast();
  const results = searching ? (leads.data ?? []).slice(0, MAX_RESULTS) : [];

  const join = (lead: Lead) =>
    add.mutate(
      { id: groupId, leadId: lead.id },
      {
        onSuccess: ({ alreadyMember }) => toast.show({ message: alreadyMember ? text.already : text.joined(lead.name) }),
        onError: () => toast.show({ message: text.failed, tone: "warning" }),
      },
    );

  return (
    <Surface variant="card" aria-label={text.title}>
      <SectionHeader title={text.title} subtitle={text.hint} />
      <Field label={text.search} icon="search" name="lead-search" type="search" autoComplete="off" onPaper value={term} onChange={setTerm} />
      {searching && leads.data ? (
        results.length > 0 ? (
          <ul aria-label={text.results} className="mt-3">
            {results.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 border-t border-ink/8 py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <p className="truncate text-small font-medium text-ink">{lead.name}</p>
                  <p className="truncate text-caption text-mute">
                    <Ltr>{lead.phone}</Ltr>
                    {copy.sep}
                    {leadsCopy.status[lead.status]}
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled={add.isPending} onClick={() => join(lead)}>
                  {text.add}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message={text.none} />
        )
      ) : null}
    </Surface>
  );
}
