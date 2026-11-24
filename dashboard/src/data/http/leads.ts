import type { LeadCounts, LeadsService } from "../services";
import type { Lead, LeadDay, LeadEvent } from "../types";
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
    setStatus: (id, status) => http.post<Lead>(`/leads/${segment(id)}/status`, { status }, "Lead", id),
    addNote: (id, text) => http.post<LeadEvent>(`/leads/${segment(id)}/notes`, { text }, "Lead", id),
    editNote: (id, noteId, text) => http.post<LeadEvent>(`/leads/${segment(id)}/notes/${segment(noteId)}`, { text }, "Lead", id),
    deleteNote: async (id, noteId) => {
      await http.post<unknown>(`/leads/${segment(id)}/notes/${segment(noteId)}/delete`, {}, "Lead", id);
    },
  };
}
