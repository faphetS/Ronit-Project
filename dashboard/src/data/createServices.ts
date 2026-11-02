import { createApiClient } from "./http/client";
import { createHttpCustomersService } from "./http/customers";
import { createHttpBirthdaysService, createHttpGreetingsService } from "./http/greetings";
import { createHttpGroupsService, createHttpOverviewService } from "./http/groups";
import { createHttpLeadsService } from "./http/leads";
import { createHttpSessionService } from "./http/session";
import { createHttpImportsService, createHttpUsersService } from "./http/users";
import type { Services } from "./services";

export interface ServicesOptions {
  /** VITE_API_URL: the API's origin. Empty: the page's own origin, which Vercel (and Vite in development) passes on to the API. */
  apiUrl: string;
  fetch?: typeof fetch;
}

/** Every service the screens use, on Ronit's API. */
export function createServices({ apiUrl, fetch }: ServicesOptions): Services {
  const api = createApiClient({ baseUrl: apiUrl, fetch });
  return {
    session: createHttpSessionService(api),
    leads: createHttpLeadsService(api),
    customers: createHttpCustomersService(api),
    groups: createHttpGroupsService(api),
    overview: createHttpOverviewService(api),
    greetings: createHttpGreetingsService(api),
    birthdays: createHttpBirthdaysService(api),
    users: createHttpUsersService(api),
    imports: createHttpImportsService(api),
  };
}
