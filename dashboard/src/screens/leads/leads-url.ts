import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router";
import type { LeadFilters, LeadStatusFilter } from "../../data/services";
import type { LeadSource } from "../../data/types";

export type LeadsView = "table" | "board";

/** The choice that filters nothing, first in every filter. */
export const ALL = "all";

export const LEAD_STATUS_FILTERS: readonly LeadStatusFilter[] = ["all", "new", "talking", "details-sent", "registered", "not-relevant"];
export const LEAD_SOURCES: readonly LeadSource[] = ["landing-page", "instagram", "facebook", "whatsapp", "referral"];
const SOURCE_FILTERS: ReadonlyArray<LeadSource | typeof ALL> = [ALL, ...LEAD_SOURCES];
const VIEWS: readonly LeadsView[] = ["table", "board"];

/** What the leads screens keep in the address, so it survives opening a lead and going back. */
export interface LeadsUrlState {
  view: LeadsView;
  status: LeadStatusFilter;
  source: LeadSource | typeof ALL;
  /** A group id, or "all". */
  group: string;
  /** A user id, or "all". */
  assignee: string;
  /** The phone screen's search field. */
  search: string;
}

const PARAM: Record<keyof LeadsUrlState, string> = {
  view: "view",
  status: "status",
  source: "source",
  group: "group",
  assignee: "assignee",
  search: "q",
};

/** Defaults stay out of the address. */
const DEFAULTS: LeadsUrlState = { view: "table", status: ALL, source: ALL, group: ALL, assignee: ALL, search: "" };

function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

export function readLeadsUrl(params: URLSearchParams): LeadsUrlState {
  return {
    view: oneOf(params.get(PARAM.view), VIEWS, DEFAULTS.view),
    status: oneOf(params.get(PARAM.status), LEAD_STATUS_FILTERS, DEFAULTS.status),
    source: oneOf(params.get(PARAM.source), SOURCE_FILTERS, DEFAULTS.source),
    group: params.get(PARAM.group) || ALL,
    assignee: params.get(PARAM.assignee) || ALL,
    search: params.get(PARAM.search) ?? "",
  };
}

interface FilterScope {
  /** The board leaves the status out: its columns are the statuses. */
  status: boolean;
  /** Only phones have the search field; on desktop the top bar searches. */
  search: boolean;
}

/** The service filters for the address, with only the filters in use, so the number of keys is the number of filters on. */
export function toLeadFilters(state: LeadsUrlState, scope: FilterScope): LeadFilters {
  const filters: LeadFilters = {};
  if (scope.status && state.status !== ALL) filters.status = state.status;
  if (state.source !== ALL) filters.source = state.source;
  if (state.group !== ALL) filters.groupId = state.group;
  if (state.assignee !== ALL) filters.assigneeId = state.assignee;
  const search = state.search.trim();
  if (scope.search && search) filters.search = search;
  return filters;
}

export function countActiveFilters(filters: LeadFilters): number {
  return Object.keys(filters).length;
}

/**
 * The view and filters in the address. Filter changes replace the history entry, so Back leaves the screen instead
 * of undoing filters one by one; links to a lead carry the address along.
 */
export function useLeadsUrl() {
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  const state = useMemo(() => readLeadsUrl(params), [params]);

  const update = useCallback(
    (patch: Partial<LeadsUrlState>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const key of Object.keys(patch) as Array<keyof LeadsUrlState>) {
            const value = patch[key];
            if (value === undefined || value === DEFAULTS[key]) next.delete(PARAM[key]);
            else next.set(PARAM[key], value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ status: ALL, source: ALL, group: ALL, assignee: ALL, search: "" }), [update]);
  const leadHref = useCallback((id: string) => `/leads/${encodeURIComponent(id)}${search}`, [search]);

  return { state, update, clearFilters, leadHref, listHref: `/leads${search}` };
}
