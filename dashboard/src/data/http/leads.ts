import type { LeadCounts, LeadsService } from "../services";
import type { Lead, LeadDay, LeadEvent, MentionFeed } from "../types";
import { dashboardApi, queryString, segment } from "./api";
import type { ApiClient } from "./client";

/** A note's text, and its tags when they are given: left out, an edit keeps the note's tags. */
const noteBody = (text: string, mentions?: string[]) => (mentions ? { text, mentions } : { text });

/** A lead as the API sends it: a server from before tags on cards sends no `tagged`. */
type ApiLead = Omit<Lead, "tagged"> & { tagged?: string[] };

/** No `tagged` means nobody is tagged, so the board never depends on the server being as new as the dashboard. */
const withTags = (lead: ApiLead): Lead => ({ ...lead, tagged: lead.tagged ?? [] });

/** Leads, as the server copies them from Monday. */
export function createHttpLeadsService(api: ApiClient): LeadsService {
  const http = dashboardApi(api);
  return {
    list: async (filters = {}) =>
      (
        await http.get<ApiLead[]>(
          `/leads${queryString({ status: filters.status, service: filters.service, source: filters.source, search: filters.search?.trim(), day: filters.day, tagged: filters.tagged })}`,
        )
      ).map(withTags),
    counts: () => http.get<LeadCounts>("/leads/counts"),
    days: () => http.get<LeadDay[]>("/leads/days"),
    get: async (id) => withTags(await http.get<ApiLead>(`/leads/${segment(id)}`, "Lead", id)),
    setStatus: async (id, status) => withTags(await http.post<ApiLead>(`/leads/${segment(id)}/status`, { status }, "Lead", id)),
    addNote: (id, text, mentions) => http.post<LeadEvent>(`/leads/${segment(id)}/notes`, noteBody(text, mentions), "Lead", id),
    editNote: (id, noteId, text, mentions) => http.post<LeadEvent>(`/leads/${segment(id)}/notes/${segment(noteId)}`, noteBody(text, mentions), "Lead", id),
    deleteNote: async (id, noteId) => {
      await http.post<unknown>(`/leads/${segment(id)}/notes/${segment(noteId)}/delete`, {}, "Lead", id);
    },
    mentions: () => http.get<MentionFeed>("/mentions"),
    markMentionsSeen: (noteIds) => http.post<{ unread: number }>("/mentions/seen", noteIds ? { noteIds } : {}),
  };
}
