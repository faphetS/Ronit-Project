import type { BirthdaysService, GreetingsService } from "../services";
import type { AudienceOption, BirthdaySettings, BirthdaysOverview, HolidayCampaign, WhatsAppStatus } from "../types";
import { dashboardApi, segment } from "./api";
import type { ApiClient } from "./client";

/**
 * Holiday greetings: the next holiday's greeting is written, sent to WhatsApp for review, tested
 * and approved here, then goes out on the eve through Zernio.
 */
export function createHttpGreetingsService(api: ApiClient): GreetingsService {
  const http = dashboardApi(api);
  return {
    current: () => http.get<HolidayCampaign | null>("/greetings/current"),
    create: () => http.post<HolidayCampaign>("/greetings"),
    submit: (id) => http.post<HolidayCampaign>(`/greetings/${segment(id)}/submit`, {}, "Campaign", id),
    whatsapp: () => http.get<WhatsAppStatus>("/greetings/whatsapp"),
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
