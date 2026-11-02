import { createApiClient, type ApiClient } from "./http/client";
import { createHttpSessionService } from "./http/session";
import { createMockServices, type MockOptions } from "./mock/createMockServices";
import type { ServiceName, Services } from "./services";

/** The services that can talk to Ronit's API so far; the rest run on the demo data. */
const HTTP_ADAPTERS: { [K in ServiceName]?: (api: ApiClient) => Services[K] } = {
  session: createHttpSessionService,
};

const SERVICE_NAMES: ServiceName[] = ["session", "leads", "customers", "groups", "overview", "greetings", "birthdays", "users", "imports"];

/** Reads VITE_HTTP_SERVICES: "session,customers", or "all". Unset or empty: everything on the demo data. */
export function httpServicesFromEnv(value = import.meta.env.VITE_HTTP_SERVICES): Set<ServiceName> {
  const asked = (value ?? "").split(",").map((name) => name.trim());
  if (asked.includes("all")) return new Set(SERVICE_NAMES);
  return new Set(SERVICE_NAMES.filter((name) => asked.includes(name)));
}

function applyHttpAdapter<K extends ServiceName>(services: Services, name: K, api: ApiClient): void {
  const adapter = HTTP_ADAPTERS[name];
  if (adapter) services[name] = adapter(api);
}

export interface ServicesOptions {
  /** Services to take from the API. One without an adapter yet stays on the demo data. */
  http: ReadonlySet<ServiceName>;
  /** VITE_API_URL: the API's origin. Empty: the page's own origin, which Vite proxies in development. */
  apiUrl: string;
  mock?: MockOptions;
}

/** The backend the screens talk to: the demo data, with the services in `http` moved to the API. */
export function createServices({ http, apiUrl, mock }: ServicesOptions): Services {
  const services = createMockServices(mock);
  if (http.size === 0) return services;
  const api = createApiClient({ baseUrl: apiUrl });
  for (const name of http) applyHttpAdapter(services, name, api);
  return services;
}
