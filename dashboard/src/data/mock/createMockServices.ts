import { leadsCopy } from "../../content/leads.he";
import { addDays, daysBetween, isoDay, now as demoNow, weekStart } from "../../lib/clock";
import { isOpenLead } from "../rules";
import {
  NotFoundError,
  ServiceUnavailableError,
  SignInError,
  type LeadCounts,
  type LeadFilters,
  type ServiceName,
  type Services,
  type GoogleStart,
  type SignedIn,
} from "../services";
import type { AuditEntry, Database, Lead, LeadStatus, OverviewStats, Session, StaffUser } from "../types";
import { createBirthdaysMock } from "./birthdaysMock";
import type { AuditInput, MockContext } from "./context";
import { createCustomersMock } from "./customersMock";
import { createDatabase } from "./generate";
import { createGreetingsMock } from "./greetingsMock";
import { createGroupsMock } from "./groupsMock";
import { createImportsMock } from "./importsMock";
import { createUsersMock } from "./usersMock";

export interface MockOptions {
  /** Starting data. Defaults to the seeded demo database. The mock always works on its own copy. */
  db?: Database;
  /** Response delay range in ms. Defaults to VITE_MOCK_LATENCY. */
  latency?: readonly [number, number];
  /** Services that fail every call, to show error states. */
  failing?: ReadonlySet<ServiceName>;
  /** Where the session is kept. Defaults to sessionStorage. */
  storage?: Storage;
  /** The current moment. Defaults to the demo "now". */
  now?: () => Date;
}

const SESSION_KEY = "or-hatzadik.session";
const SERVICE_NAMES: ServiceName[] = ["session", "leads", "customers", "groups", "overview", "greetings", "birthdays", "users", "imports"];
const WEEKS_SHOWN = 8;
/** Every sign-in in the mock is Ronit's. */
const DEMO_USER_ID = "u-ronit";

/** Reads "min,max" from VITE_MOCK_LATENCY. Defaults to 120 to 300 ms. */
export function latencyFromEnv(value = import.meta.env.VITE_MOCK_LATENCY): [number, number] {
  const [min, max] = (value ?? "120,300").split(",").map(Number);
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : [120, 300];
}

/** Reads ?mock-error=leads,customers so a screen's error state can be seen during development. */
export function failingFromSearch(search: string): Set<ServiceName> {
  const asked = new URLSearchParams(search).get("mock-error")?.split(",") ?? [];
  return new Set(SERVICE_NAMES.filter((name) => asked.includes(name)));
}

/** The in-memory backend the shell runs on until Ronit's API is connected. */
export function createMockServices(options: MockOptions = {}): Services {
  const state: Database = structuredClone(options.db ?? createDatabase());
  const [minDelay, maxDelay] = options.latency ?? latencyFromEnv();
  const failing = options.failing ?? new Set<ServiceName>();
  const storage = options.storage ?? window.sessionStorage;
  const clock = options.now ?? demoNow;
  let auditSerial = 0;
  /** Whether "Continue with Google" went through and the code is next, and where to land after it. */
  let awaitingCode = false;
  let pendingReturnTo = "/";

  /** Waits like a network call, fails when asked to, and never hands out internal objects. */
  async function respond<T>(service: ServiceName, produce: () => T): Promise<T> {
    const wait = minDelay + Math.random() * Math.max(0, maxDelay - minDelay);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (failing.has(service)) throw new ServiceUnavailableError(service);
    return structuredClone(produce());
  }

  function readSession(): Session | null {
    const raw = storage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  }

  const actingUserId = () => readSession()?.userId ?? DEMO_USER_ID;

  function logAudit<E extends AuditInput>(entry: E): AuditEntry & E {
    auditSerial += 1;
    const record = { id: `au-live-${auditSerial}`, at: clock().toISOString(), byUserId: actingUserId(), ...entry } as AuditEntry & E;
    state.audit.push(record);
    return record;
  }

  const context: MockContext = { state, respond, clock, actingUserId, logAudit };

  function findUser(id: string): StaffUser {
    const user = state.users.find((u) => u.id === id);
    if (!user) throw new NotFoundError("User", id);
    return user;
  }

  function findLead(id: string): Lead {
    const lead = state.leads.find((l) => l.id === id);
    if (!lead) throw new NotFoundError("Lead", id);
    return lead;
  }

  function recordOnLead(lead: Lead, text: string) {
    const at = clock().toISOString();
    lead.updatedAt = at;
    lead.history = [{ id: `${lead.id}-e${lead.history.length + 1}`, at, text, byUserId: readSession()?.userId ?? null, mondayBoard: null }, ...lead.history];
  }

  function leadMatches(lead: Lead, filters: LeadFilters): boolean {
    if (filters.status && filters.status !== "all" && lead.status !== filters.status) return false;
    if (filters.groupId && lead.groupId !== filters.groupId) return false;
    if (filters.source && lead.source !== filters.source) return false;
    if (filters.assigneeId && lead.assigneeId !== filters.assigneeId) return false;
    const term = filters.search?.trim();
    if (term) {
      const digits = term.replace(/\D/g, "");
      const byName = lead.name.includes(term);
      const byPhone = digits.length > 0 && lead.phone.includes(digits);
      if (!byName && !byPhone) return false;
    }
    return true;
  }

  return {
    // Like the real sign-in: "Continue with Google" (no Google here), then a code (any 6 digits).
    session: {
      async current() {
        if (failing.has("session")) throw new ServiceUnavailableError("session");
        const session = readSession();
        if (!session) return null;
        const user = state.users.find((u) => u.id === session.userId);
        return user ? { session, user: structuredClone(user) } : null;
      },
      startGoogle: ({ returnTo }) =>
        respond("session", (): GoogleStart => {
          awaitingCode = true;
          pendingReturnTo = returnTo;
          return { step: "code-required" };
        }),
      pendingCode: () =>
        respond("session", () => {
          if (!awaitingCode) return null;
          const email = state.users.find((u) => u.id === DEMO_USER_ID)?.email ?? "ronit@example.com";
          return { email: `${email[0]}***${email.slice(email.indexOf("@"))}` };
        }),
      resendCode: () =>
        respond("session", () => {
          if (!awaitingCode) throw new SignInError("step-expired");
        }),
      verifyCode: (code) =>
        respond("session", () => {
          if (!awaitingCode) throw new SignInError("step-expired");
          if (!/^\d{6}$/.test(code)) throw new SignInError("invalid-code");
          awaitingCode = false;
          const session: Session = { userId: DEMO_USER_ID, signedInAt: clock().toISOString() };
          storage.setItem(SESSION_KEY, JSON.stringify(session));
          return { signedIn: { session, user: findUser(session.userId) } satisfies SignedIn, returnTo: pendingReturnTo };
        }),
      async signOut() {
        storage.removeItem(SESSION_KEY);
      },
    },

    leads: {
      list: (filters = {}) =>
        respond("leads", () =>
          state.leads
            .filter((lead) => (filters.status === "not-relevant" ? !lead.archived && lead.status === "not-relevant" : isOpenLead(lead)))
            .filter((lead) => leadMatches(lead, filters))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        ),
      counts: () =>
        respond("leads", () => {
          const open = state.leads.filter(isOpenLead);
          const count = (status: LeadStatus) => open.filter((lead) => lead.status === status).length;
          const counts: LeadCounts = {
            all: open.length,
            new: count("new"),
            talking: count("talking"),
            "details-sent": count("details-sent"),
            registered: count("registered"),
            "not-relevant": state.leads.filter((lead) => !lead.archived && lead.status === "not-relevant").length,
          };
          return counts;
        }),
      get: (id) => respond("leads", () => findLead(id)),
      updateStatus: (id, status) =>
        respond("leads", () => {
          const lead = findLead(id);
          lead.status = status;
          recordOnLead(lead, leadsCopy.statusChanged(leadsCopy.status[status]));
          return lead;
        }),
      addNote: (id, text) =>
        respond("leads", () => {
          const lead = findLead(id);
          lead.lastNote = text;
          recordOnLead(lead, text);
          return lead;
        }),
    },

    customers: createCustomersMock(context),
    groups: createGroupsMock(context),

    overview: {
      stats: () =>
        respond("overview", () => {
          const reference = clock();
          const thisWeek = weekStart(reference);
          const weeklyLeads = Array.from({ length: WEEKS_SHOWN }, (_, index) => {
            const start = addDays(thisWeek, -7 * (WEEKS_SHOWN - 1 - index));
            const count = state.leads.filter((lead) => {
              const offset = daysBetween(start, new Date(lead.createdAt));
              return offset >= 0 && offset < 7;
            }).length;
            return { weekStart: isoDay(start), count };
          });
          const thisWeekLeads = state.leads.filter((lead) => daysBetween(thisWeek, new Date(lead.createdAt)) >= 0);
          const byStatus = (status: LeadStatus) => thisWeekLeads.filter((lead) => lead.status === status).length;
          const todayIso = isoDay(reference);
          const stats: OverviewStats = {
            openLeads: state.leads.filter(isOpenLead).length,
            customers: state.customers.length,
            activeGroups: state.groups.filter((group) => (group.endsOn ?? group.startsOn) >= todayIso).length,
            newLeadsThisWeek: thisWeekLeads.length,
            newLeadsLastWeek: weeklyLeads[WEEKS_SHOWN - 2].count,
            thisWeekByStatus: { new: byStatus("new"), talking: byStatus("talking"), registered: byStatus("registered") },
            weeklyLeads,
          };
          return stats;
        }),
      activity: () => respond("overview", () => [...state.activity].sort((a, b) => b.at.localeCompare(a.at))),
    },

    greetings: createGreetingsMock(context),
    birthdays: createBirthdaysMock(context),
    users: createUsersMock(context),
    imports: createImportsMock(context),
  };
}
