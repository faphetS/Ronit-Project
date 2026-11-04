import type { LeadCounts, LeadsService } from "../services";
import type { Lead, LeadDay } from "../types";
import { dashboardApi, queryString, segment } from "./api";
import type { ApiClient } from "./client";

/** Leads, as the server copies them from Monday. */
export function createHttpLeadsService(api: ApiClient): LeadsService {
  const http = dashboardApi(api);
  return {
    list: (filters = {}) =>
      http.get<Lead[]>(
        `/leads${queryString({ status: filters.status, service: filters.service, source: filters.source, search: filters.search?.trim(), day: filters.day })}`,
      ),
    counts: () => http.get<LeadCounts>("/leads/counts"),
    days: () => http.get<LeadDay[]>("/leads/days"),
    get: (id) => http.get<Lead>(`/leads/${segment(id)}`, "Lead", id),
  };
}
