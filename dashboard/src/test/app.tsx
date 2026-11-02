import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { createMockServices, type MockOptions } from "../data/mock/createMockServices";
import { createDatabase } from "../data/mock/generate";
import type { Services } from "../data/services";
import { ServicesProvider } from "../data/ServicesProvider";
import { dayAt } from "../lib/clock";
import { MotionRoot } from "../motion/MotionRoot";

const demoDb = createDatabase({ seed: 5787, today: dayAt("2026-10-28") });

/** Mock services on the demo data that answer instantly. Each call works on its own copy. */
export function createTestServices(options: MockOptions = {}): Services {
  return createMockServices({ db: demoDb, latency: [0, 0], now: () => dayAt("2026-10-28", "15:30"), ...options });
}

/** Mock services with Ronit already signed in, so guarded screens render. */
export async function signedInServices(options: MockOptions = {}): Promise<Services> {
  const services = createTestServices(options);
  await services.session.startGoogle({ remember: false, returnTo: "/" });
  await services.session.verifyCode("000000");
  return services;
}

export function createTestClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
}

export function TestProviders({ services, client, children }: { services: Services; client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ServicesProvider services={services}>
        <MotionRoot>{children}</MotionRoot>
      </ServicesProvider>
    </QueryClientProvider>
  );
}

interface RenderAppOptions {
  path?: string;
  /** Location state for the first entry, like { from: "/customers" }. */
  state?: unknown;
  services?: Services;
}

/** Renders routes with the app's providers in a memory router. */
export function renderApp(routes: RouteObject[], { path = "/", state, services = createTestServices() }: RenderAppOptions = {}) {
  const client = createTestClient();
  const router = createMemoryRouter(routes, { initialEntries: [state === undefined ? path : { pathname: path, state }] });
  const view = render(
    <TestProviders services={services} client={client}>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return { ...view, router, services, client };
}
