import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { globalErrorHandler } from "../../lib/errors.js";
import type { MailMessage } from "../../lib/mailer.js";
import { hashToken, newToken } from "../../lib/tokens.js";
import { SESSION_COOKIE } from "../auth/auth.cookies.js";
import type { AuthDeps, Role } from "../auth/auth.service.js";
import { ARCHIVE, CRM, fakeAccount, fakeMonday, type FakeMonday } from "../monday-copy/monday-copy.fake.js";
import { copyFromMonday, type CopyDeps } from "../monday-copy/monday-copy.service.js";
import { createDashboardRouter, type DashboardOptions } from "./dashboard.routes.js";

const DASHBOARD = "https://app.example.com";
const API = "/api/dashboard";

let db: TestDb;
let mail: MailMessage[];
let clock: Date;
let monday: FakeMonday;

const deps = (): AuthDeps => ({
  db,
  secretKey: Buffer.alloc(32, 9),
  dashboardUrl: DASHBOARD,
  google: {
    authorizeUrl: () => "https://accounts.example/auth",
    exchange: async () => {
      throw new Error("not used");
    },
    verifyCredential: async () => {
      throw new Error("not used");
    },
  },
  mailer: {
    async send(message) {
      mail.push(message);
    },
  },
  now: () => clock,
});

const copyDeps = (): CopyDeps => ({ db, gql: monday.gql, boards: { crm: CRM, archive: ARCHIVE }, now: () => clock });

function app(options: DashboardOptions = { copy: { enabled: true, deps: copyDeps } }) {
  const server = express();
  server.use(express.json());
  server.use(cookieParser());
  server.use(API, createDashboardRouter(async () => deps(), options));
  server.use(globalErrorHandler);
  return server;
}

interface Person {
  id: string;
  cookie: string;
}

/** A staff account that has signed in, with a live session. */
async function signedIn(name: string, role: Role, passportAccess = role !== "sales"): Promise<Person> {
  const email = `${name}@example.com`;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO staff_users (email, name, role, passport_access, google_sub, last_sign_in_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [email, name, role, passportAccess, `sub-${name}`, clock],
  );
  const token = newToken();
  await db.query(
    "INSERT INTO staff_sessions (user_id, token_hash, remember, created_at, last_seen_at, expires_at) VALUES ($1, $2, false, $3, $3, $4)",
    [rows[0].id, hashToken(token), clock, new Date(clock.getTime() + 12 * 3_600_000)],
  );
  return { id: rows[0].id, cookie: `${SESSION_COOKIE}=${token}` };
}

const get = (who: Person, path: string) => request(app()).get(`${API}${path}`).set("Cookie", who.cookie);
const post = (who: Person, path: string, body: object = {}, server = app()) =>
  request(server).post(`${API}${path}`).set("Cookie", who.cookie).set("Origin", DASHBOARD).send(body);

let ronit: Person;
let shira: Person;
let moran: Person;

beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
  mail = [];
  clock = new Date("2026-11-02T08:00:00Z");
  monday = fakeMonday(fakeAccount());
  await copyFromMonday(copyDeps(), "schedule");
  // An hour after the copy; sessions start now (30 idle minutes would sign them out).
  clock = new Date("2026-11-02T09:00:00Z");
  ronit = await signedIn("ronit", "admin");
  shira = await signedIn("shira", "office");
  moran = await signedIn("moran", "sales");
});

describe("the guard", () => {
  it("needs a session, and the dashboard as the origin of every change", async () => {
    expect((await request(app()).get(`${API}/leads`).expect(401)).body.code).toBe("UNAUTHENTICATED");
    const noOrigin = await request(app()).post(`${API}/users/me`).set("Cookie", ronit.cookie).send({ name: "רונית" }).expect(403);
    expect(noOrigin.body.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("follows the permission table", async () => {
    for (const path of ["/customers/intakes", "/greetings/current", "/birthdays/settings", "/users/audit"]) {
      expect((await get(moran, path).expect(403)).body.code).toBe("NO_ACCESS");
    }
    expect((await post(moran, "/imports/run").expect(403)).body.code).toBe("NO_ACCESS");
    expect((await post(shira, "/users/invites", { email: "x@example.com", name: "x", role: "sales" }).expect(403)).body.code).toBe("NO_ACCESS");
    await get(shira, "/greetings/current").expect(200);
  });
});

describe("the request limit", () => {
  it("counts per signed-in session, so one busy screen doesn't block the team", async () => {
    const limited = app({ copy: { enabled: true, deps: copyDeps }, requestsPerMinute: 3 });
    for (let i = 0; i < 3; i += 1) await request(limited).get(`${API}/leads/counts`).set("Cookie", ronit.cookie).expect(200);
    expect((await request(limited).get(`${API}/leads/counts`).set("Cookie", ronit.cookie).expect(429)).body.code).toBe("RATE_LIMITED");
    await request(limited).get(`${API}/leads/counts`).set("Cookie", shira.cookie).expect(200);
  });

  it("also counts per address, so made-up session cookies don't each get their own allowance", async () => {
    const limited = app({ copy: { enabled: true, deps: copyDeps }, requestsPerMinutePerAddress: 3 });
    for (let i = 0; i < 3; i += 1) await request(limited).get(`${API}/leads/counts`).set("Cookie", `${SESSION_COOKIE}=made-up-${i}`).expect(401);
    const flooded = await request(limited).get(`${API}/leads/counts`).set("Cookie", `${SESSION_COOKIE}=made-up-9`).expect(429);
    expect(flooded.body.code).toBe("RATE_LIMITED");
  });
});

describe("leads", () => {
  it("lists the open pipeline, counts it, and opens a lead with its Monday notes", async () => {
    const list = (await get(moran, "/leads").expect(200)).body.data;
    expect(list.map((lead: { name: string }) => lead.name)).toEqual(["שירה כהן", "יעל פרץ"]);
    expect(list[1]).toMatchObject({
      phone: "0542212219",
      status: "talking",
      source: "instagram",
      service: "uman",
      mondayGroup: "לידים חדשים אורטל",
      mondayBoard: "רונית  - CRM",
      mondayUrl: "https://ronit550418.monday.com/boards/5101856136/pulses/101",
      lastNote: "שלחתי לה את המסלול",
      archived: false,
      history: [],
    });
    expect((await get(moran, "/leads/counts").expect(200)).body.data).toEqual({
      all: 2,
      new: 1,
      "no-answer": 0,
      talking: 1,
      "details-sent": 0,
      registered: 0,
      "not-relevant": 0,
    });
    const lead = (await get(moran, `/leads/${list[1].id}`).expect(200)).body.data;
    expect(lead.history.map((event: { text: string; author: string }) => [event.text, event.author])).toEqual([
      ["שלחתי לה את המסלול", "Ronit"],
      ["אין מענה, לחזור מחר", "Ronit"],
    ]);
    await get(moran, "/leads/not-a-uuid").expect(404);
  });

  it("filters by status and service, and a search finds archived leads too", async () => {
    expect((await get(moran, "/leads?status=new").expect(200)).body.data.map((l: { name: string }) => l.name)).toEqual(["שירה כהן"]);
    expect((await get(moran, "/leads?service=uman").expect(200)).body.data.map((l: { name: string }) => l.name)).toEqual(["יעל פרץ"]);
    const found = (await get(moran, "/leads?search=052-999").expect(200)).body.data;
    expect(found).toEqual([expect.objectContaining({ name: "רחל לוי", archived: true })]);
    await get(moran, "/leads?status=bogus").expect(400);
  });
});

describe("customers", () => {
  it("lists customers with their trips, counts them, and keeps passports from people without access", async () => {
    const page = (await get(moran, "/customers").expect(200)).body.data;
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 25 });
    const shiraCohen = page.items.find((c: { firstName: string }) => c.firstName === "שירה");
    expect(shiraCohen).toMatchObject({ phone: "0501112233", whatsappConnected: true, source: "facebook", mondayPassport: "yes", passport: null });
    expect(shiraCohen.groupIds).toHaveLength(2);
    expect(shiraCohen.leadId).toEqual(expect.any(String));
    expect((await get(moran, "/customers/counts").expect(200)).body.data).toEqual({
      all: 2,
      "whatsapp-today": 0,
      expiring: 0,
      "missing-passport": 2,
      withPassport: 0,
    });
    expect((await get(moran, "/customers?search=מרים").expect(200)).body.data.total).toBe(1);
  });

  it("adds notes for office staff but not for sales", async () => {
    const [customer] = (await get(shira, "/customers?search=שירה").expect(200)).body.data.items;
    const saved = (await post(shira, `/customers/${customer.id}/notes`, { text: "  חדר קרוב למעלית  " }).expect(201)).body.data;
    expect(saved.notes).toEqual([{ id: expect.any(String), at: clock.toISOString(), text: "חדר קרוב למעלית", byUserId: shira.id }]);
    expect((await post(moran, `/customers/${customer.id}/notes`, { text: "x" }).expect(403)).body.code).toBe("NO_ACCESS");
    await post(shira, `/customers/${customer.id}/notes`, { text: "   " }).expect(400);
  });

  it("masks passport numbers, and logs revealing one", async () => {
    const [customer] = (await get(ronit, "/customers?search=שירה").expect(200)).body.data.items;
    await db.query(
      "INSERT INTO passports (customer_id, number, birth_date, expiry_date, received_via, received_at) VALUES ($1, '38412921', '1990-05-01', '2027-01-01', 'whatsapp', $2)",
      [customer.id, clock],
    );
    const card = (await get(ronit, `/customers/${customer.id}`).expect(200)).body.data;
    expect(card.passport).toMatchObject({ number: "38•••921", expiryDate: "2027-01-01", receivedVia: "whatsapp" });
    const shown = (await post(ronit, `/customers/${customer.id}/passport-views`, { part: "details" }).expect(200)).body.data;
    expect(shown).toMatchObject({ number: "38412921", entry: { action: "passport-view", byUserId: ronit.id, customerName: "שירה כהן" } });
    const log = (await get(ronit, `/customers/${customer.id}/access-log`).expect(200)).body.data;
    expect(log.map((entry: { action: string }) => entry.action)).toEqual(["passport-view", "passport-received"]);
    expect((await get(ronit, "/customers/counts").expect(200)).body.data).toMatchObject({ "whatsapp-today": 1, expiring: 1, withPassport: 1 });
    expect((await get(moran, `/customers/${customer.id}`).expect(200)).body.data.passport).toBeNull();
  });
});

describe("trips and events", () => {
  it("lists them with readiness from passports and Monday's mark, and their people", async () => {
    const groups = (await get(moran, "/groups").expect(200)).body.data;
    expect(groups.map((g: { name: string }) => g.name)).toEqual(["טיסה טו באב 26", "הפרשות חלה · נובמבר 2026"]);
    expect(groups[0]).toMatchObject({ type: "flight", capacity: null, startsOn: null, registered: 2, passportsReceived: 1, missingPassports: 1, readiness: 50 });
    expect(groups[1]).toMatchObject({ type: "event", dateLabel: "נובמבר 2026", flight: null, readiness: null });
    const people = (await get(moran, `/groups/${groups[0].id}/participants`).expect(200)).body.data;
    expect(people.map((p: { firstName: string; mondayStatus: string; note: string | null }) => [p.firstName, p.mondayStatus, p.note])).toEqual([
      ["מרים", "צוות", null],
      ["שירה", "נסגר", "חדר: לבד"],
    ]);
  });
});

describe("overview", () => {
  it("counts the pipeline, customers and active trips, and lists what happened lately", async () => {
    const stats = (await get(moran, "/overview/stats").expect(200)).body.data;
    expect(stats).toMatchObject({ openLeads: 2, customers: 2, activeGroups: 2, newLeadsThisWeek: 0, newLeadsLastWeek: 2 });
    expect(stats.weeklyLeads).toHaveLength(8);
    expect(stats.weeklyLeads.at(-1)).toEqual({ weekStart: "2026-11-01", count: 0 });
    const activity = (await get(moran, "/overview/activity").expect(200)).body.data;
    expect(activity.map((item: { kind: string }) => item.kind)).toEqual(["import", "lead", "lead"]);

    // Closing leads to a role takes the leads' names out of its feed too.
    await post(ronit, "/users/permissions", { role: "sales", area: "leads", access: "none" }).expect(200);
    const closed = (await get(moran, "/overview/activity").expect(200)).body.data;
    expect(closed.map((item: { kind: string }) => item.kind)).toEqual(["import"]);
  });
});

describe("greetings and birthdays", () => {
  it("has no current greeting until one is drafted, and offers every customer or a trip that isn't over", async () => {
    expect((await get(shira, "/greetings/current").expect(200)).body.data).toBeNull();
    expect((await get(shira, "/greetings/history").expect(200)).body.data).toEqual([]);
    const options = (await get(shira, "/greetings/audiences").expect(200)).body.data;
    expect(options.map((o: { kind: string; recipients: number }) => [o.kind, o.recipients])).toEqual([
      ["all", 2],
      ["groups", 2],
      ["groups", 1],
    ]);
  });

  it("saves birthday settings and checks them", async () => {
    const saved = (await post(shira, "/birthdays/settings", { sendTime: "10:30", shabbatRule: "before-shabbat" }).expect(200)).body.data;
    expect(saved).toMatchObject({ enabled: false, sendTime: "10:30", shabbatRule: "before-shabbat", channel: "whatsapp" });
    await post(shira, "/birthdays/settings", { sendTime: "25:00" }).expect(400);
    await post(shira, "/birthdays/settings", { template: "  " }).expect(400);
    expect((await get(shira, "/birthdays/overview").expect(200)).body.data).toEqual({ today: [], upcoming: [], recent: [], sentThisYear: 0 });
  });
});

describe("users and access", () => {
  it("shows admins the team with emails and invites, and others just the names", async () => {
    await db.query("INSERT INTO staff_users (email, name, role) VALUES ('tal@example.com', 'טל', 'sales')");
    const full = (await get(ronit, "/users").expect(200)).body.data;
    expect(full.users.map((u: { name: string; email: string }) => [u.name, u.email])).toEqual([
      ["ronit", "ronit@example.com"],
      ["shira", "shira@example.com"],
      ["moran", "moran@example.com"],
    ]);
    expect(full.invites).toEqual([expect.objectContaining({ email: "tal@example.com", role: "sales" })]);
    const limited = (await get(moran, "/users").expect(200)).body.data;
    expect(limited.users.map((u: { email: string }) => u.email)).toEqual(["", "", "moran@example.com"]);
    expect(limited.invites).toEqual([]);
  });

  it("invites by email, never gives sales passport access, and removes people", async () => {
    const sent = (await post(ronit, "/users/invites", { email: "Tal@Example.com", name: "טל", role: "sales", passportAccess: true }).expect(201)).body.data;
    expect(sent).toMatchObject({ emailed: true, invite: { email: "tal@example.com", role: "sales", passportAccess: false, sentByUserId: ronit.id } });
    expect(mail.map((m) => m.to)).toEqual(["tal@example.com"]);
    expect((await post(ronit, "/users/invites", { email: "tal@example.com", name: "טל", role: "sales" }).expect(409)).body.code).toBe("ALREADY_REGISTERED");

    clock = new Date(clock.getTime() + 60_000);
    await post(ronit, `/users/${moran.id}/remove`).expect(200);
    await get(moran, "/leads").expect(401);
    expect((await post(ronit, `/users/${ronit.id}/remove`).expect(400)).body.code).toBe("CANNOT_REMOVE_SELF");
    const log = (await get(ronit, "/users/audit").expect(200)).body.data;
    expect(log.slice(0, 2)).toEqual([
      expect.objectContaining({ action: "staff-removed", byUserId: ronit.id, userName: "moran" }),
      expect.objectContaining({ action: "staff-invited", byUserId: ronit.id, userName: "טל" }),
    ]);
  });

  it("lets people rename themselves, and admins flip the security switches", async () => {
    expect((await post(moran, "/users/me", { name: " מורן לוי " }).expect(200)).body.data).toMatchObject({ name: "מורן לוי", initial: "מ" });
    await post(moran, "/users/me", { name: "x", email: "other@example.com" }).expect(400);
    expect((await post(moran, "/users/security", { setting: "autoSignOut", enabled: false }).expect(403)).body.code).toBe("NO_ACCESS");
    const settings = (await post(ronit, "/users/security", { setting: "autoSignOut", enabled: false }).expect(200)).body.data;
    expect(settings).toMatchObject({ autoSignOut: false, twoStepRequired: true, autoSignOutMinutes: 30 });
    expect((await get(ronit, "/users/audit").expect(200)).body.data[0]).toMatchObject({ action: "security-change", setting: "autoSignOut", enabled: false });
    expect((await get(moran, "/users/permissions").expect(200)).body.data).toHaveLength(6);
  });

  it("lets admins change someone's role and passport access, from their next request", async () => {
    await get(shira, "/greetings/current").expect(200);
    const team = (await post(ronit, `/users/${shira.id}/access`, { role: "sales", passportAccess: true }).expect(200)).body.data;
    // Sales never get passport access.
    expect(team.users.find((u: { id: string }) => u.id === shira.id)).toMatchObject({ role: "sales", passportAccess: false });
    expect((await get(shira, "/greetings/current").expect(403)).body.code).toBe("NO_ACCESS");
    expect((await get(shira, "/customers/intakes").expect(403)).body.code).toBe("NO_ACCESS");

    // A pending invite too; and only admins change anyone's access.
    const { rows } = await db.query<{ id: string }>("INSERT INTO staff_users (email, name, role) VALUES ('tal@example.com', 'טל', 'sales') RETURNING id");
    const invites = (await post(ronit, `/users/${rows[0].id}/access`, { role: "office", passportAccess: true }).expect(200)).body.data.invites;
    expect(invites).toEqual([expect.objectContaining({ email: "tal@example.com", role: "office", passportAccess: true })]);
    expect((await post(shira, `/users/${moran.id}/access`, { role: "admin", passportAccess: true }).expect(403)).body.code).toBe("NO_ACCESS");

    // Your own role stays; your own passport access can change.
    expect((await post(ronit, `/users/${ronit.id}/access`, { role: "office", passportAccess: true }).expect(400)).body.code).toBe("CANNOT_CHANGE_OWN_ROLE");
    await post(ronit, `/users/${ronit.id}/access`, { role: "admin", passportAccess: false }).expect(200);
    await get(ronit, "/customers/intakes").expect(403);

    await post(ronit, "/users/00000000-0000-4000-8000-000000000000/access", { role: "office", passportAccess: false }).expect(404);
    await post(ronit, `/users/${moran.id}/access`, { role: "owner", passportAccess: false }).expect(400);
    const log = (await get(ronit, "/users/audit").expect(200)).body.data;
    expect(log.find((entry: { action: string; userName?: string }) => entry.action === "staff-access-changed" && entry.userName === "shira")).toMatchObject({
      byUserId: ronit.id,
      role: "sales",
      passportAccess: false,
    });
  });

  it("lets admins change what a role may do, except the fixed cells", async () => {
    const table = (await get(shira, "/users/permissions").expect(200)).body.data;
    expect(table.find((row: { area: string }) => row.area === "passports")).toEqual({
      area: "passports",
      access: { admin: "full", office: "full", sales: "none" },
      fixed: ["admin", "sales"],
    });
    expect(table.find((row: { area: string }) => row.area === "users").fixed).toEqual(["admin", "office", "sales"]);

    const changed = (await post(ronit, "/users/permissions", { role: "office", area: "greetings", access: "none" }).expect(200)).body.data;
    expect(changed.find((row: { area: string }) => row.area === "greetings").access).toEqual({ admin: "full", office: "none", sales: "none" });
    expect((await get(shira, "/greetings/current").expect(403)).body.code).toBe("NO_ACCESS");

    // A minute later, so the log lists the two changes in order.
    clock = new Date(clock.getTime() + 60_000);
    await post(ronit, "/users/permissions", { role: "sales", area: "greetings", access: "view" }).expect(200);
    await get(moran, "/greetings/current").expect(200);
    expect((await post(moran, "/birthdays/settings", { sendTime: "10:00" }).expect(403)).body.code).toBe("NO_ACCESS");

    for (const fixed of [
      { role: "admin", area: "leads", access: "none" },
      { role: "sales", area: "passports", access: "view" },
      { role: "office", area: "users", access: "full" },
    ]) {
      expect((await post(ronit, "/users/permissions", fixed).expect(400)).body.code).toBe("PERMISSION_FIXED");
    }
    expect((await post(shira, "/users/permissions", { role: "sales", area: "leads", access: "none" }).expect(403)).body.code).toBe("NO_ACCESS");
    const log = (await get(ronit, "/users/audit").expect(200)).body.data;
    expect(log.slice(0, 2)).toEqual([
      expect.objectContaining({ action: "permission-change", role: "sales", area: "greetings", access: "view", byUserId: ronit.id }),
      expect.objectContaining({ action: "permission-change", role: "office", area: "greetings", access: "none" }),
    ]);
  });
});

describe("the copy from Monday", () => {
  it("tells everyone how the copy stands, and lets an admin copy now", async () => {
    const status = (await get(moran, "/imports/latest").expect(200)).body.data;
    expect(status).toMatchObject({
      enabled: true,
      lastRun: { status: "completed", trigger: "schedule" },
      lastCopiedAt: "2026-11-02T08:00:00.000Z",
      // 09:00 UTC is 11:00 in Israel: the next copy is at 13:00 there.
      nextRunAt: "2026-11-02T11:00:00.000Z",
      totals: { leads: 2, archivedLeads: 1, withoutPhone: 1, customers: 2, groups: 2 },
    });
    expect(status.boards.map((b: { kind: string }) => b.kind)).toEqual(["crm", "flight", "challah", "crm-archive"]);

    // The last copy started an hour ago (08:00 → 09:00).
    const run = (await post(ronit, "/imports/run").expect(202)).body.data;
    expect(run).toMatchObject({ trigger: "manual", status: "running", byUserId: ronit.id });
    await vi.waitFor(async () => expect((await get(ronit, "/imports/latest").expect(200)).body.data.lastRun.status).toBe("completed"));
    expect((await post(ronit, "/imports/run").expect(429)).body.code).toBe("COPY_TOO_SOON");
  });

  it("is refused while the copy is switched off", async () => {
    const off = app({ copy: { enabled: false, deps: copyDeps } });
    expect((await post(ronit, "/imports/run", {}, off).expect(503)).body.code).toBe("COPY_OFF");
  });
});
