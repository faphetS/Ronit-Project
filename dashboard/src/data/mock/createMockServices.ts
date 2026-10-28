import { leadsCopy } from "../../content/leads.he";
import { addDays, daysBetween, isoDay, now as demoNow, weekStart } from "../../lib/clock";
import { EXPIRING_WITHIN_DAYS, isOpenLead } from "../rules";
import {
  NotFoundError,
  ServiceUnavailableError,
  type CustomerQuery,
  type LeadCounts,
  type LeadFilters,
  type ServiceName,
  type Services,
} from "../services";
import type { Customer, Database, Group, GroupSummary, Lead, LeadStatus, OverviewStats, Session, StaffUser } from "../types";
import { createDatabase } from "./generate";

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
const SERVICE_NAMES: ServiceName[] = ["session", "leads", "customers", "groups", "overview"];
const WEEKS_SHOWN = 8;

/** Reads "min,max" from VITE_MOCK_LATENCY. Defaults to 250 to 600 ms. */
export function latencyFromEnv(value = import.meta.env.VITE_MOCK_LATENCY): [number, number] {
  const [min, max] = (value ?? "250,600").split(",").map(Number);
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : [250, 600];
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

  function findCustomer(id: string): Customer {
    const customer = state.customers.find((c) => c.id === id);
    if (!customer) throw new NotFoundError("Customer", id);
    return customer;
  }

  function recordOnLead(lead: Lead, text: string) {
    const at = clock().toISOString();
    lead.updatedAt = at;
    lead.history = [{ id: `${lead.id}-e${lead.history.length + 1}`, at, text, byUserId: readSession()?.userId ?? null }, ...lead.history];
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

  function customerMatches(customer: Customer, query: CustomerQuery, reference: Date): boolean {
    const filter = query.filter ?? "all";
    const passport = customer.passport;
    if (filter === "whatsapp-today" && !(passport?.receivedVia === "whatsapp" && isoDay(new Date(passport.receivedAt)) === isoDay(reference))) return false;
    if (filter === "expiring" && !(passport !== null && daysBetween(reference, new Date(passport.expiryDate)) <= EXPIRING_WITHIN_DAYS)) return false;
    if (filter === "missing-passport" && passport !== null) return false;
    const term = query.search?.trim();
    if (term) {
      const digits = term.replace(/\D/g, "");
      const byName = `${customer.firstName} ${customer.lastName}`.includes(term);
      const byNumber = digits.length > 0 && (customer.phone.includes(digits) || (passport?.number.includes(digits) ?? false));
      if (!byName && !byNumber) return false;
    }
    return true;
  }

  function summarize(group: Group): GroupSummary {
    const members = state.customers.filter((c) => c.groupIds.includes(group.id));
    return { ...group, registered: members.length, passportsReceived: members.filter((c) => c.passport !== null).length };
  }

  return {
    session: {
      async current() {
        if (failing.has("session")) throw new ServiceUnavailableError("session");
        const session = readSession();
        if (!session) return null;
        const user = state.users.find((u) => u.id === session.userId);
        return user ? { session, user: structuredClone(user) } : null;
      },
      signIn: (email, password) =>
        respond("session", () => {
          if (!email.trim() || !password) throw new Error("missing-credentials");
          const session: Session = { userId: "u-ronit", signedInAt: clock().toISOString() };
          storage.setItem(SESSION_KEY, JSON.stringify(session));
          return { session, user: findUser(session.userId) };
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

    customers: {
      list: (query = {}) =>
        respond("customers", () => {
          const page = query.page ?? 1;
          const pageSize = query.pageSize ?? 25;
          const reference = clock();
          const matches = state.customers
            .filter((customer) => customerMatches(customer, query, reference))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          return { items: matches.slice((page - 1) * pageSize, page * pageSize), total: matches.length, page, pageSize };
        }),
      get: (id) => respond("customers", () => findCustomer(id)),
      intakes: () => respond("customers", () => [...state.intakes].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))),
    },

    groups: {
      list: () => respond("groups", () => state.groups.map(summarize)),
      get: (id) =>
        respond("groups", () => {
          const group = state.groups.find((g) => g.id === id);
          if (!group) throw new NotFoundError("Group", id);
          return summarize(group);
        }),
    },

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
  };
}
