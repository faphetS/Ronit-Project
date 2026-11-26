import type { LeadCounts, LeadsService } from "../services";
import type { Lead, LeadDay, LeadEvent, MentionFeed, NoteCategory } from "../types";
import { dashboardApi, queryString, segment } from "./api";
import type { ApiClient } from "./client";

/** A note's text, and its tags and kind when they are given: left out, an edit keeps the note's tags and kind. */
const noteBody = (text: string, mentions?: string[], category?: NoteCategory) => ({
  text,
  ...(mentions ? { mentions } : {}),
  ...(category ? { category } : {}),
});

/** A note as the API sends it: a server from before note kinds sends no `category`. */
type ApiEvent = Omit<LeadEvent, "category"> & { category?: NoteCategory };

/** A lead as the API sends it: a server from before tags on cards sends no `tagged`, one from before note kinds no kinds. */
type ApiLead = Omit<Lead, "tagged" | "lastNoteCategory" | "history"> & { tagged?: string[]; lastNoteCategory?: NoteCategory; history: ApiEvent[] };

/** No kind means a plain note. */
const withKind = (note: ApiEvent): LeadEvent => ({ ...note, category: note.category ?? "note" });

/** No `tagged` means nobody is tagged and no kind a plain note, so the board never depends on the server being as new as the dashboard. */
const withTags = ({ history, ...lead }: ApiLead): Lead => ({
  ...lead,
  tagged: lead.tagged ?? [],
  lastNoteCategory: lead.lastNoteCategory ?? "note",
  history: (history ?? []).map(withKind),
});

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
    addNote: async (id, text, mentions, category) =>
      withKind(await http.post<ApiEvent>(`/leads/${segment(id)}/notes`, noteBody(text, mentions, category), "Lead", id)),
    editNote: async (id, noteId, text, mentions, category) =>
      withKind(await http.post<ApiEvent>(`/leads/${segment(id)}/notes/${segment(noteId)}`, noteBody(text, mentions, category), "Lead", id)),
    deleteNote: async (id, noteId) => {
      await http.post<unknown>(`/leads/${segment(id)}/notes/${segment(noteId)}/delete`, {}, "Lead", id);
    },
    mentions: () => http.get<MentionFeed>("/mentions"),
    markMentionsSeen: (noteIds) => http.post<{ unread: number }>("/mentions/seen", noteIds ? { noteIds } : {}),
  };
}
