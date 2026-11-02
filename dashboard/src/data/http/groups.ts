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
  };
}

export function createHttpOverviewService(api: ApiClient): OverviewService {
  const http = dashboardApi(api);
  return {
    stats: () => http.get<OverviewStats>("/overview/stats"),
    activity: () => http.get<Activity[]>("/overview/activity"),
  };
}
