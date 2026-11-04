import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router";
import type { LeadFilters, LeadStatusFilter } from "../../data/services";
import type { LeadService, LeadSource } from "../../data/types";
import { isoDay, now } from "../../lib/clock";

/** The choice that filters nothing, first in every filter. */
export const ALL = "all";

/** The board's day when the address names none: today, whatever the date. */
export const TODAY = "today";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const LEAD_STATUS_FILTERS: readonly LeadStatusFilter[] = ["all", "new", "no-answer", "talking", "details-sent", "registered", "not-relevant"];
export const LEAD_SOURCES: readonly LeadSource[] = ["instagram", "facebook", "landing-page", "whatsapp", "referral"];
export const LEAD_SERVICES: readonly LeadService[] = ["uman", "challah"];
const SOURCE_FILTERS: ReadonlyArray<LeadSource | typeof ALL> = [ALL, ...LEAD_SOURCES];
const SERVICE_FILTERS: ReadonlyArray<LeadService | typeof ALL> = [ALL, ...LEAD_SERVICES];

/** What the leads screens keep in the address, so it survives opening a lead and going back. */
export interface LeadsUrlState {
  /** The desktop board's day: TODAY, ALL days, or one day as YYYY-MM-DD. */
  day: string;
  status: LeadStatusFilter;
  source: LeadSource | typeof ALL;
  service: LeadService | typeof ALL;
  /** The phone screen's search field. */
  search: string;
}

const PARAM: Record<keyof LeadsUrlState, string> = {
  day: "day",
  status: "status",
  source: "source",
  service: "service",
  search: "q",
};

/** Defaults stay out of the address. */
const DEFAULTS: LeadsUrlState = { day: TODAY, status: ALL, source: ALL, service: ALL, search: "" };

function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

function readDay(value: string | null): string {
  return value === ALL || (value !== null && DAY.test(value)) ? value : TODAY;
}

/** The board's day as YYYY-MM-DD, or null for all days. */
export function boardDay(day: string): string | null {
  if (day === ALL) return null;
  return day === TODAY ? isoDay(now()) : day;
}

export function readLeadsUrl(params: URLSearchParams): LeadsUrlState {
  return {
    day: readDay(params.get(PARAM.day)),
    status: oneOf(params.get(PARAM.status), LEAD_STATUS_FILTERS, DEFAULTS.status),
    source: oneOf(params.get(PARAM.source), SOURCE_FILTERS, DEFAULTS.source),
    service: oneOf(params.get(PARAM.service), SERVICE_FILTERS, DEFAULTS.service),
    search: params.get(PARAM.search) ?? "",
  };
}

interface FilterScope {
  /** The board leaves the status out: its columns are the statuses. */
  status: boolean;
  /** Only phones have the search field; on desktop the top bar searches. */
  search: boolean;
  /** Only the desktop board goes by day. */
  day: boolean;
}

/** The service filters for the address, with only the filters in use, so the number of keys is the number of filters on. */
export function toLeadFilters(state: LeadsUrlState, scope: FilterScope): LeadFilters {
  const filters: LeadFilters = {};
  const day = scope.day ? boardDay(state.day) : null;
  if (day) filters.day = day;
  if (scope.status && state.status !== ALL) filters.status = state.status;
  if (state.source !== ALL) filters.source = state.source;
  if (state.service !== ALL) filters.service = state.service;
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

  const clearFilters = useCallback(() => update({ status: ALL, source: ALL, service: ALL, search: "" }), [update]);
  const leadHref = useCallback((id: string) => `/leads/${encodeURIComponent(id)}${search}`, [search]);

  return { state, update, clearFilters, leadHref, listHref: `/leads${search}` };
}
