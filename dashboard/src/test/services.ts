import { NotFoundError, SignInError, type ServiceName, type Services } from "../data/services";
import type { Customer, MondayCopy, OverviewStats, PassportIntake, PermissionMatrix, Session, StaffUser, UserAccount } from "../data/types";

/**
 * For tests only: services that answer at once from a few fixed records, in place of Ronit's API. Sign-in works like
 * the real one without Google: "Continue with Google" goes straight to the code, and any 6 digits sign Ronit in.
 * Times are UTC; the clock in tests stands at 2026-10-28 15:30 Israel time (src/test/setup.ts).
 */

export const RONIT: UserAccount = {
  id: "u-ronit",
  name: "רונית ברש",
  initial: "ר",
  role: "admin",
  passportAccess: true,
  email: "ronit@example.com",
  lastSignInAt: "2026-10-28T06:12:00.000Z",
  twoStep: "active",
  whatsappPhone: "",
};

const STATS: OverviewStats = {
  openLeads: 24,
  customers: 412,
  activeGroups: 4,
  newLeadsThisWeek: 14,
  newLeadsLastWeek: 9,
  thisWeekByStatus: { new: 6, talking: 5, registered: 3 },
  weeklyLeads: ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"].map((weekStart, index) => ({
    weekStart,
    count: [8, 11, 7, 12, 10, 9, 9, 14][index],
  })),
};

/** Passports that arrived on WhatsApp today; one waits for review. */
const INTAKES: PassportIntake[] = [
  { id: "i-1", name: "שרה כהן", phone: "0526120418", receivedAt: "2026-10-28T12:32:00.000Z", result: "matched", reason: "name", customerId: "c-sara-cohen" },
  { id: "i-2", name: "לאה ברגר", phone: "0549981120", receivedAt: "2026-10-28T09:20:00.000Z", result: "new-card", reason: "no-match", customerId: "c-lea-berger" },
  { id: "i-3", name: "פנינה לוי", phone: "0545520077", receivedAt: "2026-10-28T08:05:00.000Z", result: "needs-review", reason: "ambiguous", customerId: null },
];

function customer(id: string): Customer {
  return {
    id,
    firstName: "שרה",
    lastName: "כהן",
    phone: "0526120418",
    whatsappConnected: true,
    groupIds: [],
    source: "instagram",
    assigneeId: null,
    since: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-10-28T12:32:00.000Z",
    passport: null,
    mondayPassport: "yes",
    notes: [],
    leadId: null,
    mondayBoard: "טיסה טו באב 26",
  };
}

const COPY: MondayCopy = {
  enabled: true,
  lastRun: {
    id: "run-1",
    trigger: "schedule",
    byUserId: null,
    status: "completed",
    startedAt: "2026-10-28T13:00:00.000Z",
    finishedAt: "2026-10-28T13:00:20.000Z",
    boardsRead: 4,
    apiCalls: 9,
    totals: null,
    error: null,
  },
  lastCopiedAt: "2026-10-28T13:00:20.000Z",
  nextRunAt: "2026-10-28T15:00:00.000Z",
  boards: [],
  totals: { itemsFound: 0, leads: 0, archivedLeads: 0, withoutPhone: 0, customers: 0, groups: 0, duplicatesMerged: 0, notes: 0 },
};

/** The server's starting role table. */
const PERMISSIONS: PermissionMatrix = [
  { area: "leads", access: { admin: "full", office: "full", sales: "full" }, fixed: ["admin"] },
  { area: "customers", access: { admin: "full", office: "full", sales: "view" }, fixed: ["admin"] },
  { area: "passports", access: { admin: "full", office: "full", sales: "none" }, fixed: ["admin", "sales"] },
  { area: "greetings", access: { admin: "full", office: "full", sales: "none" }, fixed: ["admin"] },
  { area: "import", access: { admin: "full", office: "none", sales: "none" }, fixed: ["admin"] },
  { area: "users", access: { admin: "full", office: "none", sales: "none" }, fixed: ["admin", "office", "sales"] },
];

export interface TestServicesOptions {
  /** Services whose every call fails, to show error states. */
  failing?: ReadonlyArray<ServiceName>;
  /** Signed in as Ronit from the start. */
  signedIn?: boolean;
}

function staffUser(user: UserAccount): StaffUser {
  return { id: user.id, name: user.name, initial: user.initial, role: user.role, passportAccess: user.passportAccess };
}

export function createTestServices({ failing = [], signedIn = false }: TestServicesOptions = {}): Services {
  let session: Session | null = signedIn ? { userId: RONIT.id, signedInAt: "2026-10-28T06:12:00.000Z" } : null;
  let awaitingCode = false;
  let pendingReturnTo = "/";
  const missing = (what: string) => (id: string) => Promise.reject(new NotFoundError(what, id));

  const services: Services = {
    session: {
      current: async () => (session ? { session, user: staffUser(RONIT) } : null),
      startGoogle: async ({ returnTo }) => {
        awaitingCode = true;
        pendingReturnTo = returnTo;
        return { step: "code-required" };
      },
      googleNonce: async () => "test-nonce",
      googleCredential: async (_credential, { returnTo }) => {
        awaitingCode = true;
        pendingReturnTo = returnTo;
        return { step: "code-required" };
      },
      pendingCode: async () => (awaitingCode ? { email: "r***@example.com" } : null),
      resendCode: async () => {
        if (!awaitingCode) throw new SignInError("step-expired");
      },
      verifyCode: async (code) => {
        if (!awaitingCode) throw new SignInError("step-expired");
        if (!/^\d{6}$/.test(code)) throw new SignInError("invalid-code");
        awaitingCode = false;
        session = { userId: RONIT.id, signedInAt: "2026-10-28T13:30:00.000Z" };
        return { signedIn: { session, user: staffUser(RONIT) }, returnTo: pendingReturnTo };
      },
      signOut: async () => {
        session = null;
      },
    },
    leads: {
      list: async () => [],
      counts: async () => ({ all: 0, new: 0, "no-answer": 0, talking: 0, "details-sent": 0, registered: 0, "not-relevant": 0 }),
      get: missing("Lead"),
    },
    customers: {
      list: async (query = {}) => ({ items: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 25 }),
      get: async (id) => customer(id),
      intakes: async () => INTAKES,
      counts: async () => ({ all: 0, "whatsapp-today": 0, expiring: 0, "missing-passport": 0, withPassport: 0 }),
      messages: async () => [],
      accessLog: async () => [],
      addNote: async (id) => customer(id),
      logPassportView: missing("Passport"),
    },
    groups: {
      list: async () => [],
      get: missing("Group"),
      participants: async () => [],
    },
    overview: {
      stats: async () => STATS,
      activity: async () => [],
    },
    greetings: {
      current: async () => null,
      create: () => Promise.reject(new NotFoundError("Campaign", "next")),
      submit: missing("Campaign"),
      whatsapp: async () => ({ connected: false, sending: false }),
      history: async () => [],
      audiences: async () => [{ id: "all", kind: "all", name: null, shortName: null, groupIds: [], recipients: 0 }],
      update: missing("Campaign"),
      approve: missing("Campaign"),
      sendTest: missing("Campaign"),
    },
    birthdays: {
      settings: async () => ({
        enabled: false,
        sendTime: "09:00",
        channel: "whatsapp",
        birthDateSource: "passport",
        shabbatRule: "after-shabbat",
        template: "",
        templateUpdatedAt: "2026-10-01T08:00:00.000Z",
        approvedTemplate: null,
        templateReview: null,
      }),
      overview: async () => ({ today: [], upcoming: [], recent: [], sentThisYear: 0 }),
      updateSettings: async (patch) => ({
        enabled: patch.enabled ?? false,
        sendTime: patch.sendTime ?? "09:00",
        channel: "whatsapp",
        birthDateSource: "passport",
        shabbatRule: patch.shabbatRule ?? "after-shabbat",
        template: patch.template ?? "",
        templateUpdatedAt: "2026-10-28T13:30:00.000Z",
        approvedTemplate: null,
        templateReview: null,
      }),
    },
    users: {
      list: async () => ({ users: [RONIT], invites: [] }),
      updateProfile: async ({ name, whatsappPhone }) => ({ ...RONIT, name, whatsappPhone: whatsappPhone ?? RONIT.whatsappPhone }),
      permissions: async () => PERMISSIONS,
      changePermission: async ({ role, area, access }) =>
        PERMISSIONS.map((row) => (row.area === area && !row.fixed.includes(role) ? { ...row, access: { ...row.access, [role]: access } } : row)),
      changeAccess: async (userId, input) => ({ users: [userId === RONIT.id ? { ...RONIT, passportAccess: input.passportAccess } : RONIT], invites: [] }),
      security: async () => ({ twoStepRequired: true, maskPassportNumbers: true, autoSignOut: true, passportAccessLog: true, autoSignOutMinutes: 30 }),
      updateSecurity: async (key, enabled) => ({
        twoStepRequired: true,
        maskPassportNumbers: true,
        autoSignOut: true,
        passportAccessLog: true,
        autoSignOutMinutes: 30,
        [key]: enabled,
      }),
      audit: async () => [],
      invite: async (input) => ({
        invite: { id: "u-new", email: input.email, role: input.role, passportAccess: input.passportAccess, sentAt: "2026-10-28T13:30:00.000Z", sentByUserId: RONIT.id },
        emailed: true,
      }),
      remove: async () => undefined,
    },
    imports: {
      latest: async () => COPY,
      copyNow: async () => ({ ...COPY.lastRun!, id: "run-2", trigger: "manual", status: "running", finishedAt: null }),
    },
  };

  // A failing service throws from every call, as the API would when it's down.
  for (const name of failing) {
    const service = services[name] as unknown as Record<string, unknown>;
    for (const key of Object.keys(service)) service[key] = () => Promise.reject(new Error(`${name} is down`));
  }
  return services;
}
