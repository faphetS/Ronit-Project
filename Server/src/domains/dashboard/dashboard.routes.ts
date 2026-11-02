import express, { type NextFunction, type Request, type Response, type Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../../config/env.js";
import type { Db } from "../../config/pg.js";
import { AppError } from "../../lib/errors.js";
import { validate } from "../../middleware/validate.js";
import { hashToken } from "../../lib/tokens.js";
import { SESSION_COOKIE, readCookie } from "../auth/auth.cookies.js";
import { authDeps, authDepsFromEnv, requireDashboardOrigin, requireStaff, withAuthDeps, type AuthDepsResolver } from "../auth/auth.middleware.js";
import { copyDepsFromEnv } from "../monday-copy/monday-copy.cron.js";
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
import { can, requireAccess, staffOf } from "./dashboard.access.js";
import { idParam, sendData } from "./dashboard.format.js";
import {
  BirthdaySettingsSchema,
  CustomerListQuerySchema,
  InviteSchema,
  LeadListQuerySchema,
  NoteSchema,
  PassportViewSchema,
  ProfileSchema,
  SecuritySchema,
} from "./dashboard.validator.js";
import { audiences, birthdaySettings, birthdaysOverview, campaignHistory, currentCampaign, updateBirthdaySettings } from "./greetings.service.js";
import { getGroup, groupParticipants, listGroups } from "./groups.service.js";
import { mondayCopyStatus } from "./imports.service.js";
import { getLead, leadCounts, listLeads } from "./leads.service.js";
import { overviewStats, recentActivity } from "./overview.service.js";
import { auditLog, directory, invite, permissions, removeUser, securitySettings, updateProfile, updateSecurity } from "./users.service.js";

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store");
  next();
}

/**
 * Requests per minute for one signed-in session (a screen makes 8 to 15). Keyed by the session, not
 * the address: everyone reaches the server through Vercel's. Without a session, by address.
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
}

/**
 * /api/dashboard: everything the dashboard's screens read and change, for signed-in staff, by
 * the permission table. Design: docs/superpowers/specs/2026-11-02-dashboard-data-design.md
 */
export function createDashboardRouter(resolveDeps: AuthDepsResolver, options: DashboardOptions = {}): Router {
  const copy = options.copy ?? { enabled: env.MONDAY_COPY_ENABLED, deps: copyDepsFromEnv };
  const router = express.Router();
  router.use(noStore, dashboardLimiter(options.requestsPerMinute ?? DASHBOARD_REQUESTS_PER_MINUTE), withAuthDeps(resolveDeps), requireDashboardOrigin, requireStaff);

  const db = (res: Response) => authDeps(res).db;
  const now = (res: Response) => authDeps(res).now();
  const viewer = (req: Request): Viewer => {
    const staff = staffOf(req);
    return { userId: staff.user.id, passports: can(staff, "passports", "view") };
  };

  // ---- Leads (read-only: edited in Monday until the switch-over) ----
  router.get("/leads", requireAccess("leads", "view"), async (req, res) => {
    sendData(res, await listLeads(db(res), LeadListQuerySchema.parse(req.query)));
  });
  router.get("/leads/counts", requireAccess("leads", "view"), async (_req, res) => {
    sendData(res, await leadCounts(db(res)));
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
  router.get("/overview/activity", async (_req, res) => {
    sendData(res, await recentActivity(db(res), now(res)));
  });

  // ---- Greetings and birthdays ----
  router.get("/greetings/current", requireAccess("greetings", "view"), async (_req, res) => {
    sendData(res, await currentCampaign(db(res)));
  });
  router.get("/greetings/history", requireAccess("greetings", "view"), async (_req, res) => {
    sendData(res, await campaignHistory(db(res)));
  });
  router.get("/greetings/audiences", requireAccess("greetings", "view"), async (_req, res) => {
    sendData(res, await audiences(db(res), now(res)));
  });
  router.get("/birthdays/settings", requireAccess("greetings", "view"), async (_req, res) => {
    sendData(res, await birthdaySettings(db(res)));
  });
  router.post("/birthdays/settings", requireAccess("greetings", "full"), validate({ body: BirthdaySettingsSchema }), async (req, res) => {
    sendData(res, await updateBirthdaySettings(db(res), req.body, now(res)));
  });
  router.get("/birthdays/overview", requireAccess("greetings", "view"), async (_req, res) => {
    sendData(res, await birthdaysOverview(db(res), now(res)));
  });

  // ---- Users and access ----
  // Everyone reads the team (for "who did it" lines), the permission table and the switches.
  router.get("/users", async (req, res) => {
    sendData(res, await directory(db(res), staffOf(req)));
  });
  router.post("/users/me", validate({ body: ProfileSchema }), async (req, res) => {
    sendData(res, await updateProfile(db(res), staffOf(req), req.body, now(res)));
  });
  router.get("/users/permissions", (_req, res) => {
    sendData(res, permissions());
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
