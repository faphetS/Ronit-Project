import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLead, useLeads, useUsers } from "../../data/queries";
import type { LeadFilters } from "../../data/services";
import type { Lead } from "../../data/types";
import { firstName } from "./leads-model";

/**
 * The leads for these filters. While new filters load, the last list stays on screen, so rows reflow into the new
 * result instead of the list blinking to a skeleton on every chip.
 */
export function useSettledLeads(filters: LeadFilters) {
  const query = useLeads(filters);
  const [last, setLast] = useState<Lead[] | undefined>(undefined);
  if (query.data !== undefined && query.data !== last) setLast(query.data);
  const data = query.data ?? (query.isError ? undefined : last);
  return {
    data,
    isPending: data === undefined && !query.isError,
    isError: data === undefined && query.isError,
    /** A newer list is on its way. */
    isUpdating: query.isFetching,
    refetch: query.refetch,
  };
}

/**
 * One lead. Until its own request answers, the copy from a list already loaded is shown,
 * so opening a lead from the list shows it at once.
 */
export function useLeadDetail(id: string) {
  const client = useQueryClient();
  const detail = useLead(id);
  const listed = useMemo(() => {
    for (const [, leads] of client.getQueriesData<Lead[]>({ queryKey: ["leads", "list"] })) {
      const found = leads?.find((lead) => lead.id === id);
      if (found) return found;
    }
    return undefined;
  }, [client, id]);
  const lead = detail.data ?? (detail.isError ? undefined : listed);
  return {
    lead,
    isPending: lead === undefined && !detail.isError,
    isError: lead === undefined && detail.isError,
    error: detail.error,
    refetch: detail.refetch,
  };
}

/** The staff, and their first names by user id, for assignees and history lines. */
export function useStaff() {
  const query = useUsers();
  const users = query.data?.users;
  const names = useMemo(() => new Map((users ?? []).map((user) => [user.id, firstName(user.name)])), [users]);
  return { users: users ?? [], names, isPending: query.isPending, isError: query.isError && !users, refetch: query.refetch };
}

/**
 * A search field's text, passed on after a pause in typing. When the value is cleared from outside
 * (the "clear filters" button), the field empties too.
 */
export function useSearchDraft(value: string, commit: (next: string) => void, delay = 300) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value === "") setDraft("");
  }
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => commit(draft), delay);
    return () => window.clearTimeout(timer);
  }, [draft, value, commit, delay]);
  return [draft, setDraft] as const;
}
