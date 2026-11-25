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
import { createHmac } from "node:crypto";
import { zernioChannel } from "../greetings/greetings.channels.js";
import { runGreetingsTick } from "../greetings/greetings.cron.js";
import { refreshWaitingTemplates } from "../greetings/whatsapp-templates.js";
import type { TemplateDraft, TemplateSend, TemplateStatus, ZernioClient } from "../greetings/zernio.client.js";
import { createZernioWebhookRouter } from "../greetings/zernio.webhook.js";
import { ARCHIVE, CRM, fakeAccount, fakeMonday, type FakeMonday } from "../monday-copy/monday-copy.fake.js";
import { copyFromMonday, type CopyDeps } from "../monday-copy/monday-copy.service.js";
import { createDashboardRouter, type DashboardOptions } from "./dashboard.routes.js";
import { forgetMondayColumns, type MirrorDeps } from "./lead-status-mirror.js";

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
const mirrorDeps = (): MirrorDeps => ({ db, gql: monday.gql, crmBoardId: CRM, now: () => clock });

function app(options: DashboardOptions = { copy: { enabled: true, deps: copyDeps }, mirror: { enabled: true, deps: mirrorDeps } }) {
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

  it("never lets signed-out requests use up the staff's allowance", async () => {
    const limited = app({ copy: { enabled: true, deps: copyDeps }, requestsPerMinute: 3 });
    for (let i = 0; i < 4; i += 1) await request(limited).get(`${API}/leads/counts`);
    await request(limited).get(`${API}/leads/counts`).set("Cookie", ronit.cookie).expect(200);
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
      mondayPending: false,
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

  it("counts leads by the day they came in, and lists one day's leads, archived ones too", async () => {
    expect((await get(moran, "/leads/days").expect(200)).body.data).toEqual([
      { day: "2026-06-01", count: 1 },
      { day: "2026-10-28", count: 1 },
      { day: "2026-10-30", count: 1 },
    ]);
    const names = async (query: string) => (await get(moran, `/leads?${query}`).expect(200)).body.data.map((l: { name: string }) => l.name);
    expect(await names("day=2026-10-28")).toEqual(["יעל פרץ"]);
    expect(await names("day=2026-06-01")).toEqual(["רחל לוי"]);
    expect(await names("day=2026-10-29")).toEqual([]);
    await get(moran, "/leads?day=2026-02-30").expect(400);
    await get(moran, "/leads?day=yesterday").expect(400);
  });
});

describe("changing a lead's status", () => {
  const leadIdOf = async (itemId: string) => (await db.query<{ id: string }>("SELECT id FROM leads WHERE monday_item_id = $1", [itemId])).rows[0].id;
  const statusLog = async () =>
    (await db.query<{ by_user_id: string; details: Record<string, string> }>("SELECT by_user_id, details FROM audit_log WHERE action = 'lead-status-changed'")).rows;

  beforeEach(() => {
    forgetMondayColumns();
  });

  it("saves it in the CRM, logs who changed it, and sets the label in Monday", async () => {
    const id = await leadIdOf("101");
    const lead = (await post(moran, `/leads/${id}/status`, { status: "no-answer" }).expect(200)).body.data;
    expect(lead).toMatchObject({ id, status: "no-answer", mondayPending: false });
    expect(monday.writes).toEqual([{ boardId: CRM, itemId: "101", columnId: "contact", label: "אין מענה" }]);
    expect(await statusLog()).toEqual([{ by_user_id: moran.id, details: { leadId: id, from: "talking", to: "no-answer" } }]);
    expect((await get(moran, "/leads/counts").expect(200)).body.data).toMatchObject({ talking: 0, "no-answer": 1 });
  });

  it("keeps the change when Monday is down, and says the label is waiting", async () => {
    const id = await leadIdOf("101");
    monday.fail = new Error("Monday HTTP 500: down");
    const lead = (await post(moran, `/leads/${id}/status`, { status: "not-relevant" }).expect(200)).body.data;
    expect(lead).toMatchObject({ status: "not-relevant", mondayPending: true });
  });

  it("changes old-board leads in the CRM only", async () => {
    const id = await leadIdOf("91");
    const lead = (await post(moran, `/leads/${id}/status`, { status: "registered" }).expect(200)).body.data;
    expect(lead).toMatchObject({ status: "registered", mondayPending: false });
    expect(monday.writes).toEqual([]);
  });

  it("does nothing when the lead already has that status", async () => {
    const id = await leadIdOf("103");
    await post(moran, `/leads/${id}/status`, { status: "new" }).expect(200);
    expect(monday.writes).toEqual([]);
    expect(await statusLog()).toEqual([]);
  });

  it("needs full access to leads, a known status, and a lead still in Monday", async () => {
    const id = await leadIdOf("101");
    await post(ronit, "/users/permissions", { role: "sales", area: "leads", access: "view" }).expect(200);
    expect((await post(moran, `/leads/${id}/status`, { status: "new" }).expect(403)).body.code).toBe("NO_ACCESS");
    await post(shira, `/leads/${id}/status`, { status: "details-sent" }).expect(400);
    await post(shira, `/leads/${id}/status`, {}).expect(400);
    await post(shira, "/leads/not-a-uuid/status", { status: "new" }).expect(404);
    await db.query("UPDATE leads SET removed_at = $2 WHERE id = $1", [id, clock]);
    await post(shira, `/leads/${id}/status`, { status: "new" }).expect(404);
    await db.query("UPDATE staff_users SET is_demo = true WHERE id = $1", [shira.id]);
    expect((await post(shira, `/leads/${id}/status`, { status: "new" }).expect(403)).body.code).toBe("DEMO_ACCOUNT");
  });
});

describe("lead notes", () => {
  const leadIdOf = async (itemId: string) => (await db.query<{ id: string }>("SELECT id FROM leads WHERE monday_item_id = $1", [itemId])).rows[0].id;
  const history = async (who: Person, id: string) => (await get(who, `/leads/${id}`).expect(200)).body.data.history;

  it("saves a note, and the history shows it first, next to Monday's", async () => {
    const id = await leadIdOf("101");
    const note = (await post(shira, `/leads/${id}/notes`, { text: "  התקשרתי, חוזרת מחר  " }).expect(201)).body.data;
    expect(note).toMatchObject({ text: "התקשרתי, חוזרת מחר", byUserId: shira.id, editedAt: null });
    const events = await history(moran, id);
    expect(events.map((e: { text: string }) => e.text)).toEqual(["התקשרתי, חוזרת מחר", "שלחתי לה את המסלול", "אין מענה, לחזור מחר"]);
    expect(events[0]).toMatchObject({ id: note.id, source: "crm", byUserId: shira.id, author: null, mondayBoard: null, editedAt: null });
    expect(events[1]).toMatchObject({ source: "monday", byUserId: null, editedAt: null });
  });

  it("lets the author edit a note, and marks it edited", async () => {
    const id = await leadIdOf("101");
    const note = (await post(shira, `/leads/${id}/notes`, { text: "first" }).expect(201)).body.data;
    clock = new Date("2026-11-02T09:20:00Z");
    const edited = (await post(shira, `/leads/${id}/notes/${note.id}`, { text: "second" }).expect(200)).body.data;
    expect(edited).toMatchObject({ id: note.id, text: "second", editedAt: "2026-11-02T09:20:00.000Z" });
    expect((await history(shira, id))[0]).toMatchObject({ text: "second", editedAt: "2026-11-02T09:20:00.000Z" });
  });

  it("keeps another user out, but lets an admin edit and delete", async () => {
    const id = await leadIdOf("101");
    const note = (await post(shira, `/leads/${id}/notes`, { text: "mine" }).expect(201)).body.data;
    expect((await post(moran, `/leads/${id}/notes/${note.id}`, { text: "x" }).expect(403)).body.code).toBe("NOT_YOUR_NOTE");
    expect((await post(moran, `/leads/${id}/notes/${note.id}/delete`).expect(403)).body.code).toBe("NOT_YOUR_NOTE");
    expect((await post(ronit, `/leads/${id}/notes/${note.id}`, { text: "by admin" }).expect(200)).body.data.text).toBe("by admin");
    await post(ronit, `/leads/${id}/notes/${note.id}/delete`).expect(200);
    expect(await history(shira, id)).toHaveLength(2);
  });

  it("refuses note edit and delete without full access, and for a removed lead", async () => {
    const id = await leadIdOf("101");
    const note = (await post(shira, `/leads/${id}/notes`, { text: "mine" }).expect(201)).body.data;
    await post(ronit, "/users/permissions", { role: "office", area: "leads", access: "view" }).expect(200);
    await post(shira, `/leads/${id}/notes/${note.id}`, { text: "x" }).expect(403);
    await post(shira, `/leads/${id}/notes/${note.id}/delete`).expect(403);
    await post(ronit, "/users/permissions", { role: "office", area: "leads", access: "full" }).expect(200);
    await db.query("UPDATE leads SET removed_at = $2 WHERE id = $1", [id, clock]);
    await post(shira, `/leads/${id}/notes/${note.id}`, { text: "x" }).expect(404);
    await post(shira, `/leads/${id}/notes/${note.id}/delete`).expect(404);
  });

  it("removes a deleted note from the history", async () => {
    const id = await leadIdOf("101");
    const note = (await post(shira, `/leads/${id}/notes`, { text: "gone soon" }).expect(201)).body.data;
    expect((await post(shira, `/leads/${id}/notes/${note.id}/delete`).expect(200)).body.data).toEqual({ deleted: true });
    expect((await history(shira, id)).map((e: { source: string }) => e.source)).toEqual(["monday", "monday"]);
    await post(shira, `/leads/${id}/notes/${note.id}/delete`).expect(404);
  });

  it("answers 404 for another lead's note, 400 for a bad body, and 403 for view-only", async () => {
    const a = await leadIdOf("101");
    const b = await leadIdOf("103");
    const note = (await post(shira, `/leads/${a}/notes`, { text: "on A" }).expect(201)).body.data;
    await post(shira, `/leads/${b}/notes/${note.id}`, { text: "x" }).expect(404);
    await post(shira, `/leads/${b}/notes/${note.id}/delete`).expect(404);
    await post(shira, `/leads/${a}/notes`, { text: "   " }).expect(400);
    await post(shira, `/leads/${a}/notes`, { text: "x".repeat(2001) }).expect(400);
    await post(shira, `/leads/${a}/notes`, { text: "ok", extra: 1 }).expect(400);
    await post(shira, `/leads/${a}/notes/${note.id}`, { text: "" }).expect(400);
    await post(shira, "/leads/not-a-uuid/notes", { text: "x" }).expect(404);
    await db.query("UPDATE leads SET removed_at = $2 WHERE id = $1", [b, clock]);
    await post(shira, `/leads/${b}/notes`, { text: "x" }).expect(404);
    await post(ronit, "/users/permissions", { role: "sales", area: "leads", access: "view" }).expect(200);
    expect((await post(moran, `/leads/${a}/notes`, { text: "x" }).expect(403)).body.code).toBe("NO_ACCESS");
  });

  it("shows the newest CRM note as the list's last note", async () => {
    const id = await leadIdOf("101");
    await post(shira, `/leads/${id}/notes`, { text: "the newest word" }).expect(201);
    const list = (await get(moran, "/leads").expect(200)).body.data;
    expect(list.find((l: { id: string }) => l.id === id).lastNote).toBe("the newest word");
  });
});

describe("note mentions", () => {
  const UNKNOWN = "00000000-0000-4000-8000-000000000000";
  const leadIdOf = async (itemId: string) => (await db.query<{ id: string }>("SELECT id FROM leads WHERE monday_item_id = $1", [itemId])).rows[0].id;
  const leadNameOf = async (id: string) => (await db.query<{ name: string }>("SELECT name FROM leads WHERE id = $1", [id])).rows[0].name;
  /** Who is tagged on a note, and when each saw it (null: not yet). */
  const tags = async (noteId: string) => {
    const { rows } = await db.query<{ user_id: string; seen_at: Date | null }>("SELECT user_id, seen_at FROM lead_note_mentions WHERE note_id = $1", [noteId]);
    return Object.fromEntries(rows.map((row) => [row.user_id, row.seen_at?.toISOString() ?? null]));
  };
  /** An account that is only tagged here, never signed in. */
  const staff = async (name: string, kind: "open" | "demo" | "removed" = "open") =>
    (
      await db.query<{ id: string }>("INSERT INTO staff_users (email, name, role, is_demo, disabled_at) VALUES ($1, $2, 'office', $3, $4) RETURNING id", [
        `${name}@example.com`,
        name,
        kind === "demo",
        kind === "removed" ? clock : null,
      ])
    ).rows[0].id;
  const note = async (who: Person, leadId: string, body: object) => (await post(who, `/leads/${leadId}/notes`, body).expect(201)).body.data;
  const edit = async (who: Person, leadId: string, noteId: string, body: object) => (await post(who, `/leads/${leadId}/notes/${noteId}`, body).expect(200)).body.data;
  const mentionsOf = async (who: Person) => (await get(who, "/mentions").expect(200)).body.data;
  const seen = async (who: Person, body: object = {}) => (await post(who, "/mentions/seen", body).expect(200)).body.data;

  it("tags people on a new note, drops unknown, demo and removed accounts, and counts your own tag as seen", async () => {
    const id = await leadIdOf("101");
    const demo = await staff("demo", "demo");
    const former = await staff("former", "removed");
    const saved = await note(shira, id, { text: "please call back", mentions: [moran.id, UNKNOWN, demo, shira.id, former, ronit.id] });
    expect(saved).toMatchObject({ text: "please call back", byUserId: shira.id, editedAt: null, mentions: [moran.id, shira.id, ronit.id] });
    expect(await tags(saved.id)).toEqual({ [moran.id]: null, [shira.id]: clock.toISOString(), [ronit.id]: null });
    expect((await note(shira, id, { text: "no tags" })).mentions).toEqual([]);
    expect((await note(shira, id, { text: "same person", mentions: [moran.id.toUpperCase()] })).mentions).toEqual([moran.id]);
  });

  it("refuses a mentions list that isn't unique ids, or has more than 20, and saves nothing then", async () => {
    const id = await leadIdOf("101");
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
    const before = await note(shira, id, { text: "kept", mentions: [moran.id] });
    for (const mentions of [[moran.id, moran.id], [moran.id, moran.id.toUpperCase()], ["moran"], moran.id, ids(21)]) {
      await post(shira, `/leads/${id}/notes`, { text: "x", mentions }).expect(400);
      await post(shira, `/leads/${id}/notes/${before.id}`, { text: "x", mentions }).expect(400);
    }
    expect((await db.query("SELECT text FROM lead_notes")).rows).toEqual([{ text: "kept" }]);
    expect(await tags(before.id)).toEqual({ [moran.id]: null });
    // Twenty ids nobody has: the note is saved, untagged.
    expect((await note(shira, id, { text: "x", mentions: ids(20) })).mentions).toEqual([]);
  });

  it("replaces the tags on an edit: dropped ones go, new ones start unseen, kept ones keep what they've seen", async () => {
    const id = await leadIdOf("101");
    const tester = await staff("tester");
    const saved = await note(shira, id, { text: "first", mentions: [moran.id, ronit.id] });
    expect(await seen(moran, { noteIds: [saved.id] })).toEqual({ unread: 0 });
    clock = new Date("2026-11-02T09:20:00Z");
    const edited = await edit(shira, id, saved.id, { text: "second", mentions: [tester, moran.id, shira.id] });
    expect(edited).toMatchObject({ id: saved.id, text: "second", editedAt: "2026-11-02T09:20:00.000Z", mentions: [tester, moran.id, shira.id] });
    const after = { [tester]: null, [moran.id]: "2026-11-02T09:00:00.000Z", [shira.id]: "2026-11-02T09:20:00.000Z" };
    expect(await tags(saved.id)).toEqual(after);

    // Without mentions, the tags stay as they are, oldest tag first.
    clock = new Date("2026-11-02T09:25:00Z");
    const again = await edit(shira, id, saved.id, { text: "third" });
    expect(again).toMatchObject({ text: "third", editedAt: "2026-11-02T09:25:00.000Z" });
    expect(again.mentions[0]).toBe(moran.id);
    expect([...again.mentions].sort()).toEqual([tester, moran.id, shira.id].sort());
    expect(await tags(saved.id)).toEqual(after);

    // An empty list takes every tag off.
    expect((await edit(shira, id, saved.id, { text: "fourth", mentions: [] })).mentions).toEqual([]);
    expect(await tags(saved.id)).toEqual({});
  });

  it("lets only the note's author or an admin change its tags; the admin's own new tag is seen", async () => {
    const id = await leadIdOf("101");
    const saved = await note(shira, id, { text: "mine", mentions: [moran.id] });
    expect((await post(moran, `/leads/${id}/notes/${saved.id}`, { text: "mine", mentions: [] }).expect(403)).body.code).toBe("NOT_YOUR_NOTE");
    expect(await tags(saved.id)).toEqual({ [moran.id]: null });
    expect((await edit(ronit, id, saved.id, { text: "mine", mentions: [moran.id, ronit.id] })).mentions).toEqual([moran.id, ronit.id]);
    expect(await tags(saved.id)).toEqual({ [moran.id]: null, [ronit.id]: clock.toISOString() });
  });

  it("shows each note's tags in the lead's history, and none on Monday's notes", async () => {
    const id = await leadIdOf("101");
    const tagged = await note(shira, id, { text: "tagged", mentions: [moran.id] });
    clock = new Date("2026-11-02T09:05:00Z");
    const plain = await note(shira, id, { text: "plain" });
    const history = (await get(moran, `/leads/${id}`).expect(200)).body.data.history;
    expect(history.map((e: { id: string; source: string; mentions: string[] }) => [e.source, e.mentions])).toEqual([
      ["crm", []],
      ["crm", [moran.id]],
      ["monday", []],
      ["monday", []],
    ]);
    expect(history.slice(0, 2).map((e: { id: string }) => e.id)).toEqual([plain.id, tagged.id]);
  });

  it("lists only your mentions, newest note first, without removed leads, and counts the unseen", async () => {
    const a = await leadIdOf("101");
    const b = await leadIdOf("103");
    const older = await note(shira, a, { text: "older", mentions: [moran.id] });
    clock = new Date("2026-11-02T09:05:00Z");
    const newer = await note(ronit, b, { text: "newer", mentions: [moran.id, shira.id] });
    clock = new Date("2026-11-02T09:10:00Z");
    const own = await note(shira, a, { text: "for the admin", mentions: [shira.id, ronit.id] });
    expect(await mentionsOf(moran)).toEqual({
      unread: 2,
      items: [
        { noteId: newer.id, leadId: b, leadName: await leadNameOf(b), byUserId: ronit.id, at: "2026-11-02T09:05:00.000Z", text: "newer", seen: false },
        { noteId: older.id, leadId: a, leadName: await leadNameOf(a), byUserId: shira.id, at: "2026-11-02T09:00:00.000Z", text: "older", seen: false },
      ],
    });
    // Your own tag is listed as seen and not counted.
    const shiras = await mentionsOf(shira);
    expect(shiras.unread).toBe(1);
    expect(shiras.items.map((m: { noteId: string; seen: boolean }) => [m.noteId, m.seen])).toEqual([
      [own.id, true],
      [newer.id, false],
    ]);
    // A lead taken out of the CRM takes its mentions out of the list and the count.
    await db.query("UPDATE leads SET removed_at = $2 WHERE id = $1", [b, clock]);
    const left = await mentionsOf(moran);
    expect(left.unread).toBe(1);
    expect(left.items.map((m: { noteId: string }) => m.noteId)).toEqual([older.id]);
  });

  it("lists the newest 30, and counts every unseen one", async () => {
    const id = await leadIdOf("101");
    await db.query(
      `INSERT INTO lead_notes (lead_id, by_user_id, at, text)
       SELECT $1, $2, $3::timestamptz + n * interval '1 minute', 'note ' || n FROM generate_series(1, 31) AS n`,
      [id, shira.id, clock],
    );
    await db.query("INSERT INTO lead_note_mentions (note_id, user_id) SELECT id, $1 FROM lead_notes", [moran.id]);
    const list = await mentionsOf(moran);
    expect(list.unread).toBe(31);
    expect(list.items).toHaveLength(30);
    expect([list.items[0].text, list.items.at(-1).text]).toEqual(["note 31", "note 2"]);
  });

  it("marks some of your mentions seen, or all of them, and answers the unread count", async () => {
    const id = await leadIdOf("101");
    const first = await note(shira, id, { text: "one", mentions: [moran.id] });
    const second = await note(shira, id, { text: "two", mentions: [moran.id] });
    const third = await note(ronit, id, { text: "three", mentions: [moran.id, shira.id] });
    expect(await seen(moran, { noteIds: [first.id] })).toEqual({ unread: 2 });
    expect(await tags(first.id)).toEqual({ [moran.id]: "2026-11-02T09:00:00.000Z" });
    // Someone else's tag on the same note stays theirs to see.
    clock = new Date("2026-11-02T09:10:00Z");
    expect(await seen(moran, { noteIds: [third.id, UNKNOWN] })).toEqual({ unread: 1 });
    expect(await tags(third.id)).toEqual({ [moran.id]: "2026-11-02T09:10:00.000Z", [shira.id]: null });
    // Without a list, all of yours; one seen before keeps its time.
    clock = new Date("2026-11-02T09:20:00Z");
    expect(await seen(moran)).toEqual({ unread: 0 });
    expect(await tags(first.id)).toEqual({ [moran.id]: "2026-11-02T09:00:00.000Z" });
    expect(await tags(second.id)).toEqual({ [moran.id]: "2026-11-02T09:20:00.000Z" });
    expect((await mentionsOf(moran)).items.map((m: { seen: boolean }) => m.seen)).toEqual([true, true, true]);
    expect((await mentionsOf(shira)).unread).toBe(1);

    for (const body of [{ noteIds: ["nope"] }, { noteIds: first.id }, { noteIds: Array.from({ length: 101 }, () => first.id) }, { all: true }]) {
      await post(moran, "/mentions/seen", body).expect(400);
    }
  });

  it("needs leads view, and refuses a demo account", async () => {
    await post(ronit, "/users/permissions", { role: "sales", area: "leads", access: "none" }).expect(200);
    expect((await get(moran, "/mentions").expect(403)).body.code).toBe("NO_ACCESS");
    expect((await post(moran, "/mentions/seen").expect(403)).body.code).toBe("NO_ACCESS");
    await post(ronit, "/users/permissions", { role: "sales", area: "leads", access: "view" }).expect(200);
    expect(await mentionsOf(moran)).toEqual({ unread: 0, items: [] });
    expect(await seen(moran)).toEqual({ unread: 0 });
    await db.query("UPDATE staff_users SET is_demo = true WHERE id = $1", [moran.id]);
    expect((await get(moran, "/mentions").expect(403)).body.code).toBe("DEMO_ACCOUNT");
    expect((await post(moran, "/mentions/seen").expect(403)).body.code).toBe("DEMO_ACCOUNT");
  });

  it("takes a deleted note's tags with it", async () => {
    const id = await leadIdOf("101");
    const saved = await note(shira, id, { text: "gone soon", mentions: [moran.id, shira.id] });
    expect((await mentionsOf(moran)).unread).toBe(1);
    await post(shira, `/leads/${id}/notes/${saved.id}/delete`).expect(200);
    expect(await tags(saved.id)).toEqual({});
    expect(await mentionsOf(moran)).toEqual({ unread: 0, items: [] });
  });

  it("marks each lead with who its notes tag, newest tag first, and lists only yours with tagged=me", async () => {
    const yael = await leadIdOf("101");
    const shiraCohen = await leadIdOf("103");
    await note(shira, yael, { text: "for moran", mentions: [moran.id] });
    clock = new Date("2026-11-02T09:05:00Z");
    await note(shira, yael, { text: "for ronit", mentions: [ronit.id] });
    // Tagged again later, Moran comes first again.
    clock = new Date("2026-11-02T09:07:00Z");
    await note(shira, yael, { text: "moran again", mentions: [moran.id] });
    clock = new Date("2026-11-02T09:10:00Z");
    await note(ronit, shiraCohen, { text: "for shira", mentions: [shira.id] });
    const tagged = async (who: Person, query = "") =>
      Object.fromEntries(((await get(who, `/leads${query}`).expect(200)).body.data as Array<{ id: string; tagged: string[] }>).map((lead) => [lead.id, lead.tagged]));
    expect(await tagged(moran)).toEqual({ [yael]: [moran.id, ronit.id], [shiraCohen]: [shira.id] });
    expect(await tagged(moran, "?tagged=me")).toEqual({ [yael]: [moran.id, ronit.id] });
    expect(await tagged(shira, "?tagged=me")).toEqual({ [shiraCohen]: [shira.id] });
    expect(await tagged(ronit, "?tagged=me&status=not-relevant")).toEqual({});
    expect((await get(moran, `/leads/${yael}`).expect(200)).body.data.tagged).toEqual([moran.id, ronit.id]);
    await get(moran, "/leads?tagged=someone").expect(400);
  });

  it("saves a note and its tags together, or neither", async () => {
    const id = await leadIdOf("101");
    await db.exec(`
      CREATE FUNCTION refuse_mention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'refused'; END $$;
      CREATE TRIGGER refuse_mention BEFORE INSERT ON lead_note_mentions FOR EACH ROW EXECUTE FUNCTION refuse_mention();
    `);
    try {
      await post(shira, `/leads/${id}/notes`, { text: "half saved", mentions: [moran.id] }).expect(500);
    } finally {
      await db.exec("DROP TRIGGER refuse_mention ON lead_note_mentions; DROP FUNCTION refuse_mention();");
    }
    expect((await db.query("SELECT 1 FROM lead_notes")).rows).toEqual([]);
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

describe("groups in the CRM", () => {
  const leadIdOf = async (itemId: string) => (await db.query<{ id: string }>("SELECT id FROM leads WHERE monday_item_id = $1", [itemId])).rows[0].id;
  const newGroup = async (body: object = { name: "  פרויקט חורף  ", type: "project" }) => (await post(shira, "/groups", body).expect(201)).body.data;
  const people = async (groupId: string) => (await get(shira, `/groups/${groupId}/participants`).expect(200)).body.data;

  beforeEach(() => {
    forgetMondayColumns();
  });

  it("creates a project group, renames it and removes it; Monday's groups refuse both", async () => {
    const group = await newGroup({ name: "  פרויקט חורף  ", type: "project", startsOn: "2026-12-01", endsOn: "2026-12-05", capacity: 20 });
    expect(group).toMatchObject({ name: "פרויקט חורף", shortName: "פרויקט חורף", type: "project", fromCrm: true, capacity: 20, startsOn: "2026-12-01", endsOn: "2026-12-05", registered: 0 });
    const listed = (await get(moran, "/groups").expect(200)).body.data;
    expect(listed.find((g: { id: string }) => g.id === group.id)).toMatchObject({ type: "project", fromCrm: true });
    expect(listed.filter((g: { fromCrm: boolean }) => !g.fromCrm)).toHaveLength(2);
    const renamed = (await post(shira, `/groups/${group.id}`, { name: "חורף 2", capacity: null, endsOn: null }).expect(200)).body.data;
    expect(renamed).toMatchObject({ name: "חורף 2", capacity: null, endsOn: null, startsOn: "2026-12-01" });
    expect((await post(shira, `/groups/${group.id}/remove`).expect(200)).body.data).toEqual({ removed: true });
    expect((await get(moran, "/groups").expect(200)).body.data.map((g: { id: string }) => g.id)).not.toContain(group.id);
    await post(shira, `/groups/${group.id}`, { name: "x" }).expect(404);
    await post(shira, `/groups/${group.id}/remove`).expect(404);
    const flight = listed.find((g: { type: string; fromCrm: boolean }) => g.type === "flight" && !g.fromCrm);
    expect((await post(shira, `/groups/${flight.id}`, { name: "x" }).expect(409)).body.code).toBe("MONDAY_GROUP");
    expect((await post(shira, `/groups/${flight.id}/remove`).expect(409)).body.code).toBe("MONDAY_GROUP");
  });

  it("refuses bad bodies", async () => {
    await post(shira, "/groups", { name: "   ", type: "project" }).expect(400);
    await post(shira, "/groups", { name: "x", type: "cruise" }).expect(400);
    await post(shira, "/groups", { name: "x", type: "event", startsOn: "2026-12-05", endsOn: "2026-12-01" }).expect(400);
    await post(shira, "/groups", { name: "x", type: "event", capacity: 0 }).expect(400);
    await post(shira, "/groups", { name: "x", type: "event", extra: 1 }).expect(400);
    const group = await newGroup();
    await post(shira, `/groups/${group.id}`, { startsOn: "2026-12-05", endsOn: "2026-12-01" }).expect(400);
    await post(shira, `/groups/${group.id}`, { type: "event" }).expect(400);
    await post(shira, `/groups/${group.id}/members`, { leadId: "nope" }).expect(400);
  });

  it("adds a CRM lead: customer card, participant, registered status, Monday label and audit", async () => {
    const group = await newGroup();
    const id = await leadIdOf("101");
    const joined = (await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(200)).body.data;
    expect(joined).toMatchObject({ alreadyMember: false });
    const customer = (await db.query<{ first_name: string; last_name: string; phone: string; from_monday: boolean }>("SELECT * FROM customers WHERE id = $1", [joined.customerId])).rows[0];
    expect(customer).toMatchObject({ first_name: "יעל", last_name: "פרץ", from_monday: false });
    const lead = (await get(shira, `/leads/${id}`).expect(200)).body.data;
    expect(customer.phone).toBe((await db.query<{ phone: string }>("SELECT phone FROM leads WHERE id = $1", [id])).rows[0].phone);
    expect(lead).toMatchObject({ customerId: joined.customerId, status: "registered", groups: [{ id: group.id, name: "פרויקט חורף", type: "project" }] });
    expect(await people(group.id)).toMatchObject([{ customerId: joined.customerId, addedInCrm: true }]);
    expect((await get(shira, `/groups/${group.id}`).expect(200)).body.data.registered).toBe(1);
    expect(monday.writes).toEqual([{ boardId: CRM, itemId: "101", columnId: "contact", label: "נסגר" }]);
    const audit = (await db.query<{ customer_id: string; details: Record<string, string>; by_user_id: string }>("SELECT customer_id, details, by_user_id FROM audit_log WHERE action = 'lead-joined-group'")).rows;
    expect(audit).toEqual([{ customer_id: joined.customerId, details: { leadId: id, groupId: group.id }, by_user_id: shira.id }]);
    const lists = (await get(shira, "/leads").expect(200)).body.data;
    expect(lists.find((l: { id: string }) => l.id === id)).not.toHaveProperty("groups");
  });

  it("answers alreadyMember the second time and adds no second participant", async () => {
    const group = await newGroup();
    const id = await leadIdOf("101");
    const first = (await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(200)).body.data;
    const again = (await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(200)).body.data;
    expect(again).toEqual({ customerId: first.customerId, alreadyMember: true });
    expect(await people(group.id)).toHaveLength(1);
    expect(monday.writes).toHaveLength(1);
  });

  it("reuses the customer with the same phone", async () => {
    const group = await newGroup();
    const id = await leadIdOf("103");
    const before = (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM customers")).rows[0].n;
    const joined = (await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(200)).body.data;
    expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM customers")).rows[0].n).toBe(before);
    expect((await db.query<{ first_name: string }>("SELECT first_name FROM customers WHERE id = $1", [joined.customerId])).rows[0].first_name).toBe("שירה");
    expect(await people(group.id)).toMatchObject([{ customerId: joined.customerId, addedInCrm: true }]);
  });

  it("never picks a relative who shares the phone: same phone and the same name, else a new card", async () => {
    const group = await newGroup();
    const { id: shiraCard, phone } = (await db.query<{ id: string; phone: string }>("SELECT id, phone FROM customers WHERE first_name = 'שירה'")).rows[0];
    const rachel = (
      await db.query<{ id: string }>(
        "INSERT INTO customers (first_name, last_name, phone, source, from_monday, created_at, updated_at) VALUES ('רחל', 'כהן', $1, 'manual', false, $2, $2) RETURNING id",
        [phone, new Date("2026-11-01T00:00:00Z")],
      )
    ).rows[0].id;
    const joined = (await post(shira, `/groups/${group.id}/members`, { leadId: await leadIdOf("103") }).expect(200)).body.data;
    expect(joined.customerId).toBe(shiraCard);
    // A lead whose name matches nobody on that phone gets a card of her own.
    await db.query("UPDATE leads SET name = 'דנה כהן', customer_id = NULL WHERE monday_item_id = '103'");
    const other = (await post(shira, `/groups/${group.id}/members`, { leadId: await leadIdOf("103") }).expect(200)).body.data;
    expect([shiraCard, rachel]).not.toContain(other.customerId);
  });

  it("uses the phone digits when a lead has no name, and keeps the lead's source on the card", async () => {
    const group = await newGroup();
    const id = await leadIdOf("101");
    await db.query("UPDATE leads SET name = phone WHERE id = $1", [id]);
    const joined = (await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(200)).body.data;
    const card = (await db.query<{ first_name: string; source: string }>("SELECT first_name, source FROM customers WHERE id = $1", [joined.customerId])).rows[0];
    const lead = (await db.query<{ phone: string; source: string }>("SELECT phone, source FROM leads WHERE id = $1", [id])).rows[0];
    expect(card.first_name).toBe(lead.phone);
    expect(card.source).toBe(lead.source);
  });

  it("leaves CRM data alone when the Monday copy runs again, even if a trip board vanishes and returns", async () => {
    const group = await newGroup();
    const flight = (await get(shira, "/groups").expect(200)).body.data.find((g: { type: string; fromCrm: boolean }) => g.type === "flight" && !g.fromCrm);
    const a = await leadIdOf("101");
    const b = await leadIdOf("103");
    const joinedA = (await post(shira, `/groups/${group.id}/members`, { leadId: a }).expect(200)).body.data;
    await post(shira, `/groups/${group.id}/members`, { leadId: b }).expect(200);
    await post(shira, `/groups/${flight.id}/members`, { leadId: a }).expect(200);
    const snapshot = async () => ({
      group: (await db.query("SELECT id, removed_at FROM groups WHERE id = $1", [group.id])).rows,
      members: (await db.query("SELECT group_id, customer_id FROM group_members WHERE monday_item_id IS NULL ORDER BY group_id, customer_id")).rows,
      card: (await db.query("SELECT id, from_monday FROM customers WHERE id = $1", [joinedA.customerId])).rows,
      links: (await db.query("SELECT id, customer_id, status FROM leads WHERE id = ANY($1::uuid[]) ORDER BY id", [[a, b]])).rows,
    });
    const before = await snapshot();
    expect(before.members).toHaveLength(3);
    clock = new Date("2026-11-02T10:00:00Z");
    await copyFromMonday(copyDeps(), "schedule");
    expect(await snapshot()).toEqual(before);
    const flightBoard = monday.boards.find((x) => x.name.includes("טיסה"))!;
    monday.boards = monday.boards.filter((x) => x !== flightBoard);
    clock = new Date("2026-11-02T11:00:00Z");
    await copyFromMonday(copyDeps(), "schedule");
    expect((await snapshot()).members).toEqual(before.members);
    monday.boards.push(flightBoard);
    clock = new Date("2026-11-02T12:00:00Z");
    await copyFromMonday(copyDeps(), "schedule");
    expect(await snapshot()).toEqual(before);
    expect(before.links.every((l) => l.status === "registered")).toBe(true);
  });

  it("answers 404 for an unknown group and a removed lead, and 403 without full access", async () => {
    const group = await newGroup();
    const id = await leadIdOf("101");
    await post(shira, `/groups/00000000-0000-4000-8000-000000000000/members`, { leadId: id }).expect(404);
    await db.query("UPDATE leads SET removed_at = $2 WHERE id = $1", [id, clock]);
    await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(404);
    await post(ronit, "/users/permissions", { role: "sales", area: "customers", access: "view" }).expect(200);
    await post(moran, `/groups/${group.id}`, { name: "x" }).expect(403);
    await post(moran, `/groups/${group.id}/members/00000000-0000-4000-8000-000000000000/remove`).expect(403);
  });

  it("keeps the lead registered when a member is removed", async () => {
    const group = await newGroup();
    const id = await leadIdOf("101");
    await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(200);
    const [member] = await people(group.id);
    await post(shira, `/groups/${group.id}/members/${member.id}/remove`).expect(200);
    expect((await get(shira, `/leads/${id}`).expect(200)).body.data.status).toBe("registered");
  });

  it("adds an old-board lead without writing to Monday", async () => {
    const group = await newGroup();
    const id = await leadIdOf("91");
    await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(200);
    expect((await get(shira, `/leads/${id}`).expect(200)).body.data).toMatchObject({ status: "registered", groups: [{ id: group.id }] });
    expect(monday.writes).toEqual([]);
  });

  it("removes a CRM-added member but not one from Monday", async () => {
    const group = await newGroup();
    const joined = await post(shira, `/groups/${group.id}/members`, { leadId: await leadIdOf("101") }).expect(200);
    const [member] = await people(group.id);
    expect(joined.body.data.customerId).toBe(member.customerId);
    await post(shira, `/groups/${group.id}/members/${member.id}/remove`).expect(200);
    expect(await people(group.id)).toEqual([]);
    await post(shira, `/groups/${group.id}/members/${member.id}/remove`).expect(404);
    const flight = (await get(shira, "/groups").expect(200)).body.data.find((g: { type: string }) => g.type === "flight");
    const [mondayMember] = await people(flight.id);
    expect(mondayMember.addedInCrm).toBe(false);
    expect((await post(shira, `/groups/${flight.id}/members/${mondayMember.id}/remove`).expect(409)).body.code).toBe("MONDAY_MEMBER");
    await post(shira, `/groups/${group.id}/members/${mondayMember.id}/remove`).expect(404);
  });

  it("needs customers full, and leads full to join; demo is refused", async () => {
    const group = await newGroup();
    const id = await leadIdOf("101");
    await post(ronit, "/users/permissions", { role: "sales", area: "customers", access: "view" }).expect(200);
    await post(moran, "/groups", { name: "x", type: "event" }).expect(403);
    await post(moran, `/groups/${group.id}/members`, { leadId: id }).expect(403);
    await post(moran, `/groups/${group.id}/remove`).expect(403);
    await post(ronit, "/users/permissions", { role: "office", area: "leads", access: "view" }).expect(200);
    expect((await post(shira, `/groups/${group.id}/members`, { leadId: id }).expect(403)).body.code).toBe("NO_ACCESS");
    expect(monday.writes).toEqual([]);
    await db.query("UPDATE staff_users SET is_demo = true WHERE id = $1", [ronit.id]);
    expect((await post(ronit, "/groups", { name: "x", type: "event" }).expect(403)).body.code).toBe("DEMO_ACCOUNT");
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
    // Recipients are the people WhatsApp can reach: the trip's crew member has no phone.
    expect(options.map((o: { kind: string; recipients: number }) => [o.kind, o.recipients])).toEqual([
      ["all", 1],
      ["groups", 1],
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

  it("lets admins give usernames and passwords, and people change their own", async () => {
    // At the invite: a username and a first password. The answer says there is one, never what it is.
    const sent = (
      await post(ronit, "/users/invites", { email: "tal@example.com", name: "טל", role: "office", username: " Tal ", password: "first-pass-1" }).expect(201)
    ).body.data;
    expect(sent.invite).toMatchObject({ username: "tal", hasPassword: true });
    expect(JSON.stringify(sent)).not.toContain("first-pass-1");
    expect(mail.at(-1)?.text).toContain("שם המשתמש tal");
    expect((await post(ronit, "/users/invites", { email: "x@example.com", name: "x", role: "office", username: "tal" }).expect(409)).body.code).toBe("USERNAME_TAKEN");
    expect((await post(ronit, "/users/invites", { email: "y@example.com", name: "y", role: "office", password: "short" }).expect(400)).body.code).toBe("WEAK_PASSWORD");
    expect((await post(ronit, "/users/invites", { email: "z@example.com", name: "z", role: "office", username: "z" }).expect(400)).body.code).toBe("INVALID_USERNAME");

    // Admins set someone's username and password; the new password signs them out.
    expect((await post(shira, `/users/${moran.id}/sign-in`, { password: "new-pass-123" }).expect(403)).body.code).toBe("NO_ACCESS");
    await post(ronit, `/users/${moran.id}/sign-in`, {}).expect(400);
    const team = (await post(ronit, `/users/${moran.id}/sign-in`, { username: "moran", password: "new-pass-123" }).expect(200)).body.data;
    expect(team.users.find((u: { id: string }) => u.id === moran.id)).toMatchObject({ username: "moran", hasPassword: true });
    await get(moran, "/leads").expect(401);
    // Like the email, only admins see other people's usernames.
    const limited = (await get(shira, "/users").expect(200)).body.data;
    expect(limited.users.find((u: { name: string }) => u.name === "moran")).toMatchObject({ username: "", hasPassword: false });

    // On your own account, the session you're in stays.
    await post(ronit, `/users/${ronit.id}/sign-in`, { password: "ronit-pass-1" }).expect(200);
    expect((await post(ronit, "/users/me/password", { current: "wrong-pass", next: "ronit-pass-2" }).expect(400)).body.code).toBe("WRONG_PASSWORD");
    await post(ronit, "/users/me/password", { current: "ronit-pass-1", next: "ronit-pass-2" }).expect(200);
    expect((await get(ronit, "/users").expect(200)).body.data.users[0]).toMatchObject({ name: "ronit", hasPassword: true });

    const log = (await get(ronit, "/users/audit").expect(200)).body.data;
    expect(log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "username-changed", byUserId: ronit.id, userName: "moran", username: "moran" }),
        expect.objectContaining({ action: "password-set", byUserId: ronit.id, userName: "moran", own: false }),
        expect.objectContaining({ action: "password-set", byUserId: ronit.id, userName: "ronit", own: true }),
      ]),
    );
    // A first password is the office's to set.
    expect((await post(shira, "/users/me/password", { current: "anything", next: "shira-pass-1" }).expect(400)).body.code).toBe("NO_PASSWORD");
  }, 30_000);

  it("refuses a demo account every dashboard route, so none of the real data reaches it", async () => {
    await db.query("UPDATE staff_users SET is_demo = true WHERE id = $1", [moran.id]);
    for (const path of ["/leads", "/customers", "/users", "/overview/stats", "/imports/latest"]) {
      expect((await get(moran, path).expect(403)).body.code).toBe("DEMO_ACCOUNT");
    }
    expect((await post(moran, "/users/me/password", { current: "x", next: "new-password-1" }).expect(403)).body.code).toBe("DEMO_ACCOUNT");
    // Others are unaffected.
    await get(shira, "/leads").expect(200);
  });

  it("shows a special account without the code as two-step off", async () => {
    await db.query("UPDATE staff_users SET two_step_exempt = true WHERE id = $1", [moran.id]);
    const team = (await get(ronit, "/users").expect(200)).body.data;
    expect(team.users.find((u: { id: string }) => u.id === moran.id)).toMatchObject({ twoStep: "off" });
    expect(team.users.find((u: { id: string }) => u.id === shira.id)).toMatchObject({ twoStep: "active" });
  });

  it("caps password and username changes per session", async () => {
    const server = app();
    for (let i = 0; i < 10; i++) await post(ronit, `/users/${moran.id}/sign-in`, { username: `moran${i}` }, server).expect(200);
    expect((await post(ronit, `/users/${moran.id}/sign-in`, { username: "moran-x" }, server).expect(429)).body.code).toBe("TOO_MANY_ATTEMPTS");
    // Another session has its own count.
    await post(shira, "/users/me/password", { current: "anything", next: "shira-pass-1" }, server).expect(400);
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

// ---- Greetings on WhatsApp, through a fake Zernio ----

interface FakeZernio extends ZernioClient {
  templates: Map<string, TemplateDraft & { status: TemplateStatus }>;
  sent: TemplateSend[];
}

function fakeZernio(): FakeZernio {
  const templates = new Map<string, TemplateDraft & { status: TemplateStatus }>();
  const sent: TemplateSend[] = [];
  return {
    templates,
    sent,
    async createTemplate(template) {
      templates.set(template.name, { ...template, status: "PENDING" });
      return { status: "PENDING" };
    },
    async templateStatus(name) {
      return templates.get(name)?.status ?? null;
    },
    async deleteTemplate(name) {
      templates.delete(name);
    },
    async sendTemplate(message) {
      sent.push(message);
      return { messageId: `wamid.${sent.length}` };
    },
  };
}

const WEBHOOK_SECRET = "zernio-test-secret";

describe("greetings on WhatsApp", () => {
  let zernio: FakeZernio;
  let connected: ZernioClient | null;
  const wa = () =>
    app({
      copy: { enabled: true, deps: copyDeps },
      whatsapp: { zernio: () => connected, sending: () => true, isAllowed: () => true, language: "he" },
    });
  const webhook = () => {
    const server = express();
    server.use(
      "/api/zernio",
      express.raw({ type: "application/json" }),
      createZernioWebhookRouter({ db: async () => db, secret: () => WEBHOOK_SECRET, accountId: () => "acc-1", now: () => clock }),
    );
    return server;
  };
  const deliver = (event: object, secret = WEBHOOK_SECRET) => {
    const body = JSON.stringify({ id: "evt-1", account: { accountId: "acc-1" }, ...event });
    return request(webhook())
      .post("/api/zernio/webhook")
      .set("Content-Type", "application/json")
      .set("X-Zernio-Signature", createHmac("sha256", secret).update(body).digest("hex"))
      .send(body);
  };
  const approveAll = async () => {
    for (const template of zernio.templates.values()) template.status = "APPROVED";
    await refreshWaitingTemplates({ db, zernio, now: () => clock });
  };

  beforeEach(() => {
    zernio = fakeZernio();
    connected = zernio;
  });

  it("writes the next holiday's greeting, has WhatsApp review it, tests it, and sends it on the eve", async () => {
    const server = wa();
    const draft = (await post(ronit, "/greetings", {}, server).expect(201)).body.data;
    // Hanukkah 5787 starts on Friday 4 December: noon, before Shabbat.
    expect(draft).toMatchObject({
      holiday: "hanukkah",
      hebrewYear: 5787,
      eve: "2026-12-04",
      sendAt: "2026-12-04T10:00:00.000Z",
      status: "draft",
      stage: "write",
      message: "",
      template: null,
    });
    expect((await post(ronit, "/greetings", {}, server).expect(409)).body.code).toBe("CAMPAIGN_IN_PROGRESS");
    const at = (path = "") => `/greetings/${draft.id}${path}`;

    // What Meta would refuse is caught before it goes.
    expect((await post(ronit, at("/submit"), {}, server).expect(400)).body.code).toBe("EMPTY_MESSAGE");
    await post(ronit, at(), { message: "{שם פרטי}, חג שמח" }, server).expect(200);
    expect((await post(ronit, at("/submit"), {}, server).expect(400)).body.code).toBe("STARTS_WITH_PLACEHOLDER");
    await post(ronit, at(), { message: "חג שמח ל{שם הקבוצה}" }, server).expect(200);
    expect((await post(ronit, at("/submit"), {}, server).expect(400)).body.code).toBe("PLACEHOLDER_NOT_ALLOWED");

    // To the trip, with the person's name and the trip's.
    const trip = (await get(shira, "/greetings/audiences").expect(200)).body.data.find((o: { kind: string }) => o.kind === "groups");
    await post(ronit, at(), { message: "חג חנוכה שמח {שם פרטי}, מכל {שם הקבוצה}! רונית", audienceId: trip.id }, server).expect(200);
    const inReview = (await post(ronit, at("/submit"), {}, server).expect(200)).body.data;
    expect(inReview).toMatchObject({ status: "in-review", stage: "review", template: { status: "PENDING", reason: null } });
    const [template] = [...zernio.templates.values()];
    expect(template).toMatchObject({ language: "he", body: "חג חנוכה שמח {{1}}, מכל {{2}}! רונית", examples: ["שרה", "טיסה לאומן"] });
    expect((await post(ronit, at("/approve"), {}, server).expect(409)).body.code).toBe("NOT_REVIEWED");

    await approveAll();
    expect((await get(shira, "/greetings/current").expect(200)).body.data).toMatchObject({
      status: "awaiting-approval",
      stage: "approve",
      template: { status: "APPROVED" },
    });

    // A test to your own WhatsApp needs your number.
    expect((await post(ronit, at("/test"), {}, server).expect(400)).body.code).toBe("NO_TEST_NUMBER");
    const me = (await post(ronit, "/users/me", { name: "רונית ברש", whatsappPhone: "050-111-2233" }, server).expect(200)).body.data;
    expect(me.whatsappPhone).toBe("0501112233");
    expect((await post(ronit, at("/test"), {}, server).expect(200)).body.data.lastTest).toEqual({ at: clock.toISOString(), toUserId: ronit.id });
    // The approved text with a sample name and the trip's: no customer's details, nothing the tester typed.
    expect(zernio.sent).toEqual([{ to: "972501112233", name: template.name, language: "he", params: ["שרה", "טיסה טו באב 26"] }]);
    // Each test is a paid message: not twice in a row.
    expect((await post(ronit, at("/test"), {}, server).expect(429)).body.code).toBe("TEST_TOO_SOON");
    expect(zernio.sent).toHaveLength(1);

    expect((await post(ronit, at("/approve"), {}, server).expect(200)).body.data).toMatchObject({ status: "scheduled", stage: "track", approvedByUserId: ronit.id });

    // On the eve it goes out as the approved template, and the receipts come back.
    clock = new Date("2026-12-04T10:00:00Z");
    await runGreetingsTick({ db, channel: zernioChannel(zernio), isAllowed: () => true, maxPerRun: 10, pacingMs: 0, now: () => clock, sleep: async () => {} });
    expect(zernio.sent.at(-1)).toEqual({ to: "972501112233", name: template.name, language: "he", params: ["שירה", "טיסה טו באב 26"] });
    await deliver({ event: "message.read", message: { platformMessageId: "wamid.2" } }).expect(200);
    await runGreetingsTick({ db, channel: zernioChannel(zernio), isAllowed: () => true, maxPerRun: 10, pacingMs: 0, now: () => clock, sleep: async () => {} });
    // A month on, the morning's sessions are long over.
    const tal = await signedIn("tal", "office");
    const sent = (await get(tal, "/greetings/history").expect(200)).body.data[0];
    expect(sent).toMatchObject({ status: "completed", stats: { sent: 1, delivered: 1, read: 1, failed: 0 } });
  });

  it("never pairs a template with a text that changed while it went for review", async () => {
    const server = wa();
    const { id } = (await post(ronit, "/greetings", {}, server).expect(201)).body.data;
    await post(ronit, `/greetings/${id}`, { message: "חג שמח {שם פרטי}!" }, server).expect(200);
    // While Meta is asked, the text is edited (another tab, another person).
    const create = zernio.createTemplate;
    zernio.createTemplate = async (template) => {
      await db.query("UPDATE campaigns SET message = 'חג אורים שמח {שם פרטי}!' WHERE id = $1", [id]);
      return create(template);
    };
    expect((await post(ronit, `/greetings/${id}/submit`, {}, server).expect(409)).body.code).toBe("CHANGED_MEANWHILE");
    expect((await get(shira, "/greetings/current").expect(200)).body.data).toMatchObject({ status: "draft", template: null });
    expect(zernio.templates.size).toBe(0);
  });

  it("caps test sends at ten a day per person", async () => {
    const server = wa();
    const { id } = (await post(ronit, "/greetings", {}, server).expect(201)).body.data;
    await post(ronit, `/greetings/${id}`, { message: "חג שמח {שם פרטי}!" }, server).expect(200);
    expect((await post(ronit, `/greetings/${id}/test`, {}, server).expect(409)).body.code).toBe("WRONG_STAGE");
    await post(ronit, `/greetings/${id}/submit`, {}, server).expect(200);
    await approveAll();
    await post(ronit, "/users/me", { name: "רונית", whatsappPhone: "0501112233" }, server).expect(200);
    for (let i = 0; i < 10; i += 1) {
      await post(ronit, `/greetings/${id}/test`, {}, server).expect(200);
      clock = new Date(clock.getTime() + 31_000);
    }
    expect((await post(ronit, `/greetings/${id}/test`, {}, server).expect(429)).body.code).toBe("TEST_LIMIT");
    expect(zernio.sent).toHaveLength(10);
    // Every test shows in the log with the number it went to, and so does the number's change.
    const log = (await get(ronit, "/users/audit").expect(200)).body.data;
    expect(log[0]).toMatchObject({ action: "greeting-test", byUserId: ronit.id, holiday: "hanukkah", to: "0501112233" });
    expect(log.find((entry: { action: string }) => entry.action === "staff-phone-changed")).toMatchObject({ userId: ronit.id, phone: "0501112233" });
  });

  it("sends a changed text back to writing, and a new audience back to Ronit's approval", async () => {
    const server = wa();
    const { id } = (await post(ronit, "/greetings", {}, server).expect(201)).body.data;
    await post(ronit, `/greetings/${id}`, { message: "חג שמח {שם פרטי}!" }, server).expect(200);
    await post(ronit, `/greetings/${id}/submit`, {}, server).expect(200);
    await approveAll();
    await post(ronit, `/greetings/${id}/approve`, {}, server).expect(200);

    const trip = (await get(shira, "/greetings/audiences").expect(200)).body.data.find((o: { kind: string }) => o.kind === "groups");
    const moved = (await post(ronit, `/greetings/${id}`, { audienceId: trip.id }, server).expect(200)).body.data;
    expect(moved).toMatchObject({ status: "awaiting-approval", approvedAt: null });

    const rewritten = (await post(ronit, `/greetings/${id}`, { message: "חג אורים שמח {שם פרטי}!" }, server).expect(200)).body.data;
    expect(rewritten).toMatchObject({ status: "draft", template: null });
    // The old text's template is gone at Meta too.
    expect(zernio.templates.size).toBe(0);
  });

  it("takes Meta's verdicts from the signed webhook only", async () => {
    const server = wa();
    const { id } = (await post(ronit, "/greetings", {}, server).expect(201)).body.data;
    await post(ronit, `/greetings/${id}`, { message: "חג שמח {שם פרטי}!" }, server).expect(200);
    await post(ronit, `/greetings/${id}/submit`, {}, server).expect(200);
    const [name] = zernio.templates.keys();
    const rejected = { event: "whatsapp.template.status_updated", template: { name, status: "REJECTED", reason: "INVALID_FORMAT" } };

    await deliver(rejected, "wrong-secret").expect(401);
    expect((await get(shira, "/greetings/current").expect(200)).body.data.status).toBe("in-review");
    await deliver(rejected).expect(200);
    expect((await get(shira, "/greetings/current").expect(200)).body.data).toMatchObject({
      status: "draft",
      template: { status: "REJECTED", reason: "INVALID_FORMAT" },
    });

    // An event id is applied once: a replay under it changes nothing, and an event without one isn't taken.
    await deliver({ ...rejected, template: { name, status: "APPROVED", reason: "NONE" } }).expect(200);
    expect((await get(shira, "/greetings/current").expect(200)).body.data.template.status).toBe("REJECTED");
    await deliver({ ...rejected, id: undefined }).expect(400);
  });

  it("is written but not sent for review while WhatsApp isn't connected", async () => {
    connected = null;
    const server = wa();
    const { id } = (await post(ronit, "/greetings", {}, server).expect(201)).body.data;
    await post(ronit, `/greetings/${id}`, { message: "חג שמח {שם פרטי}!" }, server).expect(200);
    expect((await post(ronit, `/greetings/${id}/submit`, {}, server).expect(503)).body.code).toBe("WHATSAPP_NOT_CONNECTED");
    const status = (await request(server).get(`${API}/greetings/whatsapp`).set("Cookie", shira.cookie).expect(200)).body.data;
    expect(status).toEqual({ connected: false, sending: true });
  });

  it("sends a new birthday text for review, and keeps the approved one meanwhile", async () => {
    const server = wa();
    const text = "מזל טוב {שם פרטי}, בת {גיל} היום!";
    const first = (await post(shira, "/birthdays/settings", { template: text }, server).expect(200)).body.data;
    expect(first).toMatchObject({ approvedTemplate: null, templateReview: { status: "PENDING", reason: null } });
    await approveAll();
    expect((await get(shira, "/birthdays/settings").expect(200)).body.data).toMatchObject({ approvedTemplate: text, templateReview: null });

    const second = (await post(shira, "/birthdays/settings", { template: "יום הולדת שמח {שם פרטי}!" }, server).expect(200)).body.data;
    expect(second).toMatchObject({ template: "יום הולדת שמח {שם פרטי}!", approvedTemplate: text, templateReview: { status: "PENDING" } });
    // Back to the approved text: the newer one isn't needed.
    expect((await post(shira, "/birthdays/settings", { template: text }, server).expect(200)).body.data.templateReview).toBeNull();
    expect((await post(shira, "/birthdays/settings", { template: "{שם פרטי} מזל טוב" }, server).expect(400)).body.code).toBe("STARTS_WITH_PLACEHOLDER");
  });
});
