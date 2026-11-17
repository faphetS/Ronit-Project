import { createDemoServices, type DataServices } from "./demo/demoServices";
import { createApiClient } from "./http/client";
import { createHttpCustomersService } from "./http/customers";
import { createHttpBirthdaysService, createHttpGreetingsService } from "./http/greetings";
import { createHttpGroupsService, createHttpOverviewService } from "./http/groups";
import { createHttpLeadsService } from "./http/leads";
import { createHttpSessionService } from "./http/session";
import { createHttpImportsService, createHttpUsersService } from "./http/users";
import type { Services, SessionService, SignedIn } from "./services";

export interface ServicesOptions {
  /** VITE_API_URL: the API's origin. Empty: the page's own origin, which Vercel (and Vite in development) passes on to the API. */
  apiUrl: string;
  fetch?: typeof fetch;
}

const DATA_SERVICES = ["leads", "customers", "groups", "overview", "greetings", "birthdays", "users", "imports"] as const satisfies readonly (keyof DataServices)[];

/** Tells `onSignedIn` who is signed in each time the session service learns it: on load, after signing in, and after signing out. */
function watchSession(session: SessionService, onSignedIn: (signedIn: SignedIn | null) => void): SessionService {
  return {
    ...session,
    async current() {
      const signedIn = await session.current();
      onSignedIn(signedIn);
      return signedIn;
    },
    async googleCredential(credential, options) {
      const result = await session.googleCredential(credential, options);
      if (result.step === "signed-in") onSignedIn(result.signedIn);
      return result;
    },
    async password(login, password, options) {
      const result = await session.password(login, password, options);
      if (result.step === "signed-in") onSignedIn(result.signedIn);
      return result;
    },
    async verifyCode(code) {
      const result = await session.verifyCode(code);
      onSignedIn(result.signedIn);
      return result;
    },
    async signOut() {
      await session.signOut();
      onSignedIn(null);
    },
  };
}

/** One service whose every call goes to whichever set `current` picks at the moment of the call. */
function switching<K extends keyof DataServices>(name: K, current: () => DataServices): DataServices[K] {
  return new Proxy({} as DataServices[K], {
    get: (_target, method) => (...args: unknown[]) => (current()[name] as unknown as Record<PropertyKey, (...callArgs: unknown[]) => unknown>)[method](...args),
  });
}

/**
 * Every service the screens use, on Ronit's API. While a demo account is signed in, everything but the session runs
 * on sample data in the browser instead (data/demo); the API refuses such a session all of Ronit's data anyway.
 */
export function createServices({ apiUrl, fetch }: ServicesOptions): Services {
  const api = createApiClient({ baseUrl: apiUrl, fetch });
  const live: DataServices = {
    leads: createHttpLeadsService(api),
    customers: createHttpCustomersService(api),
    groups: createHttpGroupsService(api),
    overview: createHttpOverviewService(api),
    greetings: createHttpGreetingsService(api),
    birthdays: createHttpBirthdaysService(api),
    users: createHttpUsersService(api),
    imports: createHttpImportsService(api),
  };
  let demo: DataServices | null = null;
  let inDemo = false;
  const current = (): DataServices => (inDemo ? (demo ??= createDemoServices()) : live);
  const session = watchSession(createHttpSessionService(api), (signedIn) => {
    inDemo = signedIn?.user.demo === true;
    // A fresh set of samples for each demo sign-in.
    if (!inDemo) demo = null;
  });
  const data = Object.fromEntries(DATA_SERVICES.map((name) => [name, switching(name, current)])) as unknown as DataServices;
  return { session, ...data };
}
