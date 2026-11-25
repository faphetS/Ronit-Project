import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { useAccess } from "../data/queries";
import type { Role } from "../data/types";
import type { Services } from "../data/services";
import { ServicesProvider } from "../data/ServicesProvider";
import { MotionRoot } from "../motion/MotionRoot";
import { createTestServices, type TestServicesOptions } from "./services";

export { createTestServices } from "./services";

/** Ronit's test services with the signed-in person in another role, as the starting role table gives it. */
export async function signedInAs(role: Role, options: Omit<TestServicesOptions, "signedIn"> = {}): Promise<Services> {
  const base = await signedInServices(options);
  return {
    ...base,
    session: {
      ...base.session,
      current: async () => {
        const current = await base.session.current();
        return current && { ...current, user: { ...current.user, role } };
      },
    },
  };
}

/** Says "role known" once the session and the role table are in, so a test can tell "never asked" from "not asked yet". */
export function RoleKnown() {
  return useAccess() ? <p>role known</p> : null;
}

/** Test services with Ronit already signed in, so guarded screens render. */
export async function signedInServices(options: Omit<TestServicesOptions, "signedIn"> = {}): Promise<Services> {
  return createTestServices({ ...options, signedIn: true });
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
