import express, { type NextFunction, type Request, type Response, type Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../../config/env.js";
import type { Db } from "../../config/pg.js";
import { AppError } from "../../lib/errors.js";
import { validate } from "../../middleware/validate.js";
import { hashToken } from "../../lib/tokens.js";
import { SESSION_COOKIE, readCookie } from "../auth/auth.cookies.js";
import { authDeps, authDepsFromEnv, requireDashboardOrigin, requireStaff, withAuthDeps, type AuthDepsResolver } from "../auth/auth.middleware.js";
import { needsTemplates } from "../greetings/outbox.sender.js";
import { greetingsChannelFromEnv } from "../greetings/greetings.channels.js";
import { zernioFromEnv, type ZernioClient } from "../greetings/zernio.client.js";
import { copyDepsFromEnv } from "../monday-copy/monday-copy.cron.js";
import { isAllowed } from "../whatsapp/uman-welcome.service.js";
import { startManualCopy, type CopyDeps } from "../monday-copy/monday-copy.service.js";
import {
  addCustomerNote,
  customerCounts,
  customerMessages,
  getCustomer,
  listCustomers,
  listIntakes,
  passportAccessLog,
  revealPassport,
  type Viewer,
} from "./customers.service.js";
import { can, loadAccess, requireAccess, staffOf } from "./dashboard.access.js";
import { idParam, sendData } from "./dashboard.format.js";
import {
  AccessSchema,
  BirthdaySettingsSchema,
  CampaignPatchSchema,
  CustomerListQuerySchema,
  InviteSchema,
  LeadListQuerySchema,
  NoteSchema,
  PassportViewSchema,
  PermissionChangeSchema,
  ProfileSchema,
  SecuritySchema,
} from "./dashboard.validator.js";
import {
  approveCampaign,
  audiences,
  birthdaySettings,
  birthdaysOverview,
  campaignHistory,
  createCampaign,
  currentCampaign,
  sendCampaignTest,
  submitCampaign,
  updateBirthdaySettings,
  updateCampaign,
  type GreetingsDeps,
  type WhatsAppStatusDto,
} from "./greetings.service.js";
import { getGroup, groupParticipants, listGroups } from "./groups.service.js";
import { mondayCopyStatus } from "./imports.service.js";
import { getLead, leadCounts, leadDays, listLeads } from "./leads.service.js";
import { overviewStats, recentActivity } from "./overview.service.js";
import {
  auditLog,
  changeAccess,
  changePermission,
  directory,
  invite,
  permissions,
  removeUser,
  securitySettings,
  updateProfile,
  updateSecurity,
} from "./users.service.js";

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store");
  next();
}

/**
 * Requests per minute for one signed-in session (a screen makes 8 to 15). Keyed by the session, not
 * the address: everyone reaches the server through Vercel's. Without a session, by address.
 *
 * Not also per address: staff share Vercel's few addresses, so a flood of signed-out requests sent
 * through the dashboard's own address would fill them and lock every staff member out. Requests
 * without a session are already counted per address here, apart from staff.
 */
export const DASHBOARD_REQUESTS_PER_MINUTE = 600;

function dashboardLimiter(limit: number) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const session = readCookie(req, SESSION_COOKIE);
      return session ? `session:${hashToken(session)}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
    },
    message: { status: "error", code: "RATE_LIMITED", message: "Too many requests" },
  });
}

export interface DashboardOptions {
  /** The copy from Monday: whether it's on, and how to reach Monday. Tests pass a fake. */
  copy?: { enabled: boolean; deps: (db: Db) => CopyDeps };
  /** Requests per minute per session. */
  requestsPerMinute?: number;
  /** WhatsApp for greetings: Zernio (null while it isn't connected), and whether greetings go out. Tests pass a fake. */
  whatsapp?: { zernio: () => ZernioClient | null; sending: () => boolean; isAllowed: (msisdn: string) => boolean; language: string };
}

const whatsappFromEnv: NonNullable<DashboardOptions["whatsapp"]> = {
  zernio: zernioFromEnv,
  sending: () => env.GREETINGS_ENABLED && env.GREETINGS_CHANNEL === "zernio" && needsTemplates(greetingsChannelFromEnv()),
  isAllowed,
  language: env.ZERNIO_TEMPLATE_LANGUAGE,
};

/**
 * /api/dashboard: everything the dashboard's screens read and change, for signed-in staff, by
 * the permission table. Design: docs/superpowers/specs/2026-11-02-dashboard-data-design.md
 */
export function createDashboardRouter(resolveDeps: AuthDepsResolver, options: DashboardOptions = {}): Router {
  const copy = options.copy ?? { enabled: env.MONDAY_COPY_ENABLED, deps: copyDepsFromEnv };
  const whatsapp = options.whatsapp ?? whatsappFromEnv;
  const router = express.Router();
  router.use(
    noStore,
    dashboardLimiter(options.requestsPerMinute ?? DASHBOARD_REQUESTS_PER_MINUTE),
    withAuthDeps(resolveDeps),
    requireDashboardOrigin,
    requireStaff,
    loadAccess,
  );

  const db = (res: Response) => authDeps(res).db;
  const now = (res: Response) => authDeps(res).now();
  const viewer = (req: Request): Viewer => ({ userId: staffOf(req).user.id, passports: can(req, "passports", "view") });
  const greetings = (req: Request, res: Response): GreetingsDeps => ({
    db: db(res),
    zernio: whatsapp.zernio(),
    language: whatsapp.language,
    isAllowed: whatsapp.isAllowed,
    showsCustomers: can(req, "customers", "view"),
    now: () => now(res),
  });

  // ---- Leads (read-only: edited in Monday until the switch-over) ----
  router.get("/leads", requireAccess("leads", "view"), async (req, res) => {
    sendData(res, await listLeads(db(res), LeadListQuerySchema.parse(req.query)));
  });
  router.get("/leads/counts", requireAccess("leads", "view"), async (_req, res) => {
    sendData(res, await leadCounts(db(res)));
  });
  router.get("/leads/days", requireAccess("leads", "view"), async (_req, res) => {
    sendData(res, await leadDays(db(res)));
  });
  router.get("/leads/:id", requireAccess("leads", "view"), async (req, res) => {
    sendData(res, await getLead(db(res), idParam(req.params.id, "Lead")));
  });

  // ---- Customers and passports ----
  router.get("/customers", requireAccess("customers", "view"), async (req, res) => {
    sendData(res, await listCustomers(db(res), viewer(req), CustomerListQuerySchema.parse(req.query), now(res)));
  });
  router.get("/customers/counts", requireAccess("customers", "view"), async (_req, res) => {
    sendData(res, await customerCounts(db(res), now(res)));
  });
  router.get("/customers/intakes", requireAccess("passports", "view"), async (_req, res) => {
    sendData(res, await listIntakes(db(res)));
  });
  router.get("/customers/:id", requireAccess("customers", "view"), async (req, res) => {
    sendData(res, await getCustomer(db(res), viewer(req), idParam(req.params.id, "Customer")));
  });
  router.get("/customers/:id/messages", requireAccess("customers", "view"), async (req, res) => {
    sendData(res, await customerMessages(db(res), idParam(req.params.id, "Customer")));
  });
  router.get("/customers/:id/access-log", requireAccess("passports", "view"), async (req, res) => {
    sendData(res, await passportAccessLog(db(res), idParam(req.params.id, "Customer")));
  });
  router.post("/customers/:id/notes", requireAccess("customers", "full"), validate({ body: NoteSchema }), async (req, res) => {
    sendData(res, await addCustomerNote(db(res), viewer(req), idParam(req.params.id, "Customer"), req.body.text, now(res)), 201);
  });
  router.post("/customers/:id/passport-views", requireAccess("passports", "view"), validate({ body: PassportViewSchema }), async (req, res) => {
    sendData(res, await revealPassport(db(res), viewer(req), idParam(req.params.id, "Passport"), req.body.part, now(res)));
  });

  // ---- Trips and events ----
  router.get("/groups", requireAccess("customers", "view"), async (_req, res) => {
    sendData(res, await listGroups(db(res)));
  });
  router.get("/groups/:id", requireAccess("customers", "view"), async (req, res) => {
    sendData(res, await getGroup(db(res), idParam(req.params.id, "Group")));
  });
  router.get("/groups/:id/participants", requireAccess("customers", "view"), async (req, res) => {
    sendData(res, await groupParticipants(db(res), viewer(req), idParam(req.params.id, "Group"), now(res)));
  });

  // ---- Overview: for everyone signed in ----
  router.get("/overview/stats", async (_req, res) => {
    sendData(res, await overviewStats(db(res), now(res)));
  });
  router.get("/overview/activity", async (req, res) => {
    const access = { leads: can(req, "leads", "view"), customers: can(req, "customers", "view"), passports: can(req, "passports", "view") };
    sendData(res, await recentActivity(db(res), now(res), access));
  });

  // ---- Greetings and birthdays ----
  router.get("/greetings/current", requireAccess("greetings", "view"), async (req, res) => {
    sendData(res, await currentCampaign(db(res), can(req, "customers", "view")));
  });
  router.get("/greetings/history", requireAccess("greetings", "view"), async (_req, res) => {
    sendData(res, await campaignHistory(db(res)));
  });
  router.get("/greetings/audiences", requireAccess("greetings", "view"), async (_req, res) => {
    sendData(res, await audiences(db(res), now(res)));
  });
  router.get("/greetings/whatsapp", requireAccess("greetings", "view"), (_req, res) => {
    const status: WhatsAppStatusDto = { connected: whatsapp.zernio() !== null, sending: whatsapp.sending() };
    sendData(res, status);
  });
  // A greeting for the next holiday, then its text and audience, WhatsApp's review, Ronit's approval and a test.
  router.post("/greetings", requireAccess("greetings", "full"), async (req, res) => {
    sendData(res, await createCampaign(greetings(req, res), staffOf(req)), 201);
  });
  router.post("/greetings/:id", requireAccess("greetings", "full"), validate({ body: CampaignPatchSchema }), async (req, res) => {
    sendData(res, await updateCampaign(greetings(req, res), staffOf(req), idParam(req.params.id, "Campaign"), req.body));
  });
  router.post("/greetings/:id/submit", requireAccess("greetings", "full"), async (req, res) => {
    sendData(res, await submitCampaign(greetings(req, res), staffOf(req), idParam(req.params.id, "Campaign")));
  });
  router.post("/greetings/:id/approve", requireAccess("greetings", "full"), async (req, res) => {
    sendData(res, await approveCampaign(greetings(req, res), staffOf(req), idParam(req.params.id, "Campaign")));
  });
  router.post("/greetings/:id/test", requireAccess("greetings", "full"), async (req, res) => {
    sendData(res, await sendCampaignTest(greetings(req, res), staffOf(req), idParam(req.params.id, "Campaign")));
  });
  router.get("/birthdays/settings", requireAccess("greetings", "view"), async (_req, res) => {
    sendData(res, await birthdaySettings(db(res)));
  });
  router.post("/birthdays/settings", requireAccess("greetings", "full"), validate({ body: BirthdaySettingsSchema }), async (req, res) => {
    sendData(res, await updateBirthdaySettings(greetings(req, res), staffOf(req), req.body));
  });
  router.get("/birthdays/overview", requireAccess("greetings", "view"), async (req, res) => {
    sendData(res, await birthdaysOverview(db(res), now(res), can(req, "customers", "view")));
  });

  // ---- Users and access ----
  // Everyone reads the team (for "who did it" lines), the permission table and the switches.
  router.get("/users", async (req, res) => {
    sendData(res, await directory(db(res), staffOf(req), can(req, "users", "full")));
  });
  router.post("/users/me", validate({ body: ProfileSchema }), async (req, res) => {
    sendData(res, await updateProfile(db(res), staffOf(req), req.body, now(res)));
  });
  router.get("/users/permissions", async (_req, res) => {
    sendData(res, await permissions(db(res)));
  });
  router.post("/users/permissions", requireAccess("users", "full"), validate({ body: PermissionChangeSchema }), async (req, res) => {
    sendData(res, await changePermission(db(res), staffOf(req), req.body, now(res)));
  });
  router.get("/users/security", async (_req, res) => {
    sendData(res, await securitySettings(db(res)));
  });
  router.post("/users/security", requireAccess("users", "full"), validate({ body: SecuritySchema }), async (req, res) => {
    sendData(res, await updateSecurity(db(res), staffOf(req), req.body.setting, req.body.enabled, now(res)));
  });
  router.get("/users/audit", requireAccess("users", "full"), async (_req, res) => {
    sendData(res, await auditLog(db(res)));
  });
  router.post("/users/invites", requireAccess("users", "full"), validate({ body: InviteSchema }), async (req, res) => {
    sendData(res, await invite(authDeps(res), staffOf(req), req.body), 201);
  });
  router.post("/users/:id/access", requireAccess("users", "full"), validate({ body: AccessSchema }), async (req, res) => {
    sendData(res, await changeAccess(authDeps(res), staffOf(req), idParam(req.params.id, "Staff user"), req.body));
  });
  router.post("/users/:id/remove", requireAccess("users", "full"), async (req, res) => {
    await removeUser(authDeps(res), staffOf(req), idParam(req.params.id, "Staff user"));
    sendData(res, null);
  });

  // ---- The copy from Monday ----
  // Everyone sees when the data was copied (the leads screen says so); admins can copy now.
  router.get("/imports/latest", async (_req, res) => {
    sendData(res, await mondayCopyStatus(db(res), copy.enabled, now(res)));
  });
  router.post("/imports/run", requireAccess("import", "full"), async (req, res) => {
    if (!copy.enabled) throw new AppError(503, "The copy from Monday is switched off on this server", "COPY_OFF");
    sendData(res, await startManualCopy(copy.deps(db(res)), staffOf(req).user.id), 202);
  });

  return router;
}

export default createDashboardRouter(authDepsFromEnv);
