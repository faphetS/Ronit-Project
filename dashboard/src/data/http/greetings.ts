import type { BirthdaysService, GreetingsService } from "../services";
import type { AudienceOption, BirthdaySettings, BirthdaysOverview, HolidayCampaign } from "../types";
import { dashboardApi, segment } from "./api";
import type { ApiClient } from "./client";

/**
 * Holiday greetings. Nothing drafts one on the server yet (that comes with the greetings step),
 * so there's no current greeting to edit, approve or test; those calls reach routes the server
 * doesn't have yet and fail like any other error.
 */
export function createHttpGreetingsService(api: ApiClient): GreetingsService {
  const http = dashboardApi(api);
  return {
    current: () => http.get<HolidayCampaign | null>("/greetings/current"),
    history: () => http.get<HolidayCampaign[]>("/greetings/history"),
    audiences: () => http.get<AudienceOption[]>("/greetings/audiences"),
    update: (id, patch) => http.post<HolidayCampaign>(`/greetings/${segment(id)}`, patch, "Campaign", id),
    approve: (id) => http.post<HolidayCampaign>(`/greetings/${segment(id)}/approve`, {}, "Campaign", id),
    sendTest: (id) => http.post<HolidayCampaign>(`/greetings/${segment(id)}/test`, {}, "Campaign", id),
  };
}

export function createHttpBirthdaysService(api: ApiClient): BirthdaysService {
  const http = dashboardApi(api);
  return {
    settings: () => http.get<BirthdaySettings>("/birthdays/settings"),
    overview: () => http.get<BirthdaysOverview>("/birthdays/overview"),
    updateSettings: (patch) => http.post<BirthdaySettings>("/birthdays/settings", patch),
  };
}
