import type { GroupsService, OverviewService } from "../services";
import type { Activity, GroupParticipant, GroupSummary, OverviewStats } from "../types";
import { dashboardApi, segment } from "./api";
import type { ApiClient } from "./client";

/** Trips and events, as the server copies them from Monday's trip boards. */
export function createHttpGroupsService(api: ApiClient): GroupsService {
  const http = dashboardApi(api);
  return {
    list: () => http.get<GroupSummary[]>("/groups"),
    get: (id) => http.get<GroupSummary>(`/groups/${segment(id)}`, "Group", id),
    participants: (id) => http.get<GroupParticipant[]>(`/groups/${segment(id)}/participants`, "Group", id),
    create: (input) => http.post<GroupSummary>("/groups", input),
    update: (id, patch) => http.post<GroupSummary>(`/groups/${segment(id)}`, patch, "Group", id),
    remove: async (id) => {
      await http.post<unknown>(`/groups/${segment(id)}/remove`, {}, "Group", id);
    },
    addLead: (id, leadId) =>
      http.post<{ customerId: string; alreadyMember: boolean }>(`/groups/${segment(id)}/members`, { leadId }, "Group", id),
    removeMember: async (id, memberId) => {
      await http.post<unknown>(`/groups/${segment(id)}/members/${segment(memberId)}/remove`, {}, "Group", id);
    },
  };
}

export function createHttpOverviewService(api: ApiClient): OverviewService {
  const http = dashboardApi(api);
  return {
    stats: () => http.get<OverviewStats>("/overview/stats"),
    activity: () => http.get<Activity[]>("/overview/activity"),
  };
}
