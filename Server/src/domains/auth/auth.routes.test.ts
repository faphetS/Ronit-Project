import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { AppError, globalErrorHandler } from "../../lib/errors.js";
import type { GoogleIdentity } from "../../lib/google-oidc.js";
import type { MailMessage } from "../../lib/mailer.js";
import { createAuthRouter } from "./auth.routes.js";
import type { AuthDeps } from "./auth.service.js";
import { inviteStaff } from "./staff-accounts.service.js";

const DASHBOARD = "https://app.example.com";

let db: TestDb;
let mail: MailMessage[];
let identity: GoogleIdentity;

const deps = (): AuthDeps => ({
  db,
  secretKey: Buffer.alloc(32, 9),
  dashboardUrl: DASHBOARD,
  google: {
    authorizeUrl: ({ state, nonce, codeChallenge }) => `https://accounts.example/auth?state=${state}&nonce=${nonce}&code_challenge=${codeChallenge}`,
    exchange: async () => identity,
    verifyCredential: async ({ credential }) => {
      if (credential === "forged") throw new AppError(502, "Google sign-in failed: bad token signature", "GOOGLE_FAILED");
      return identity;
    },
  },
  mailer: {
    async send(message) {
      mail.push(message);
    },
  },
  now: () => new Date("2026-11-02T10:00:00Z"),
});

function testApp(options: { signInLimit?: number } = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter(async () => deps(), options));
  app.use(globalErrorHandler);
  return app;
}

/**
 * A browser's cookies for the API. supertest's own agent won't send Secure cookies over
 * plain http, so they're carried by hand.
 */
class Jar {
  readonly raw = new Map<string, string>();
  private values = new Map<string, string>();

  take(res: request.Response): this {
    const header = res.headers["set-cookie"] as unknown as string[] | undefined;
    for (const cookie of header ?? []) {
      const [pair] = cookie.split(";");
      const name = pair.slice(0, pair.indexOf("="));
      const value = pair.slice(pair.indexOf("=") + 1);
      this.raw.set(name, cookie);
      if (value === "") this.values.delete(name);
      else this.values.set(name, value);
    }
    return this;
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  header(): string {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

/** "Continue with Google" and Google's answer, as the browser goes through them. */
async function throughGoogle(app: express.Express, jar: Jar, query = "remember=1&returnTo=%2Fcustomers") {
  const start = await request(app).get(`/api/auth/google?${query}`).expect(302);
  jar.take(start);
  const state = new URL(start.headers.location).searchParams.get("state");
  const back = await request(app).get(`/api/auth/google/callback?state=${state}&code=from-google`).set("Cookie", jar.header()).expect(302);
  jar.take(back);
  return { start, back };
}

beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
  mail = [];
  identity = { sub: "google-ronit", email: "ronit@example.com", name: "Ronit" };
  await inviteStaff(
    { db, dashboardUrl: DASHBOARD, mailer: null, now: () => new Date("2026-11-02T09:00:00Z") },
    { email: "ronit@example.com", name: "רונית ברש", role: "admin", passportAccess: true, whatsappPhone: null },
  );
});

describe("/api/auth", () => {
  it("goes through Google and the emailed code to a session, and signs out", async () => {
    const app = testApp();
    const jar = new Jar();
    const { start, back } = await throughGoogle(app, jar);

    expect(start.headers.location).toMatch(/^https:\/\/accounts\.example\/auth\?state=[\w-]{43}&nonce=[\w-]{43}&code_challenge=[\w-]{43}$/);
    expect(new Jar().take(start).raw.get("__Host-oh_google")).toMatch(/; Max-Age=600; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Lax$/);
    expect(back.headers.location).toBe(`${DASHBOARD}/login?step=code`);
    expect(jar.has("__Host-oh_google")).toBe(false);
    expect(jar.raw.get("__Host-oh_challenge")).toMatch(/; Max-Age=1800; .*HttpOnly; Secure; SameSite=Strict$/);
    expect(back.headers["cache-control"]).toBe("no-store");

    const pending = await request(app).get("/api/auth/code").set("Cookie", jar.header()).expect(200);
    expect(pending.body).toEqual({ status: "ok", email: "r***@example.com" });

    const code = /\d{6}/.exec(mail[0].subject)?.[0];
    const verified = await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).set("Cookie", jar.header()).send({ code }).expect(200);
    jar.take(verified);
    expect(verified.body).toEqual({
      status: "ok",
      step: "signed-in",
      session: { userId: expect.any(String), signedInAt: "2026-11-02T10:00:00.000Z" },
      user: { id: verified.body.session.userId, name: "רונית ברש", initial: "ר", role: "admin", passportAccess: true },
      returnTo: "/customers",
    });
    expect(jar.has("__Host-oh_challenge")).toBe(false);
    expect(jar.raw.get("__Host-oh_session")).toMatch(/; Max-Age=2592000; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Strict$/);
    expect(jar.raw.get("__Host-oh_device")).toMatch(/; Max-Age=31536000; .*HttpOnly; Secure; SameSite=Strict$/);

    const session = await request(app).get("/api/auth/session").set("Cookie", jar.header()).expect(200);
    expect(session.body).toEqual({ status: "ok", session: verified.body.session, user: verified.body.user });

    const beforeSignOut = jar.header();
    jar.take(await request(app).post("/api/auth/sign-out").set("Origin", DASHBOARD).set("Cookie", jar.header()).expect(200));
    expect(jar.has("__Host-oh_session")).toBe(false);
    expect(jar.has("__Host-oh_device")).toBe(true);
    // The old cookie, replayed, is dead on the server too.
    expect((await request(app).get("/api/auth/session").set("Cookie", beforeSignOut).expect(401)).body.code).toBe("UNAUTHENTICATED");
  });

  it("takes Google's button through the emailed code", async () => {
    const app = testApp();
    const jar = new Jar();
    const nonce = await request(app).get("/api/auth/google/nonce").expect(200);
    jar.take(nonce);
    expect(nonce.body).toEqual({ status: "ok", nonce: expect.stringMatching(/^[\w-]{43}$/) });
    expect(jar.raw.get("__Host-oh_gnonce")).toMatch(/; Max-Age=1800; .*HttpOnly; Secure; SameSite=Strict$/);

    const answered = await request(app)
      .post("/api/auth/google/credential")
      .set("Origin", DASHBOARD)
      .set("Cookie", jar.header())
      .send({ credential: "id-token", remember: true, returnTo: "/customers" })
      .expect(200);
    jar.take(answered);
    expect(answered.body).toEqual({ status: "ok", step: "code-required" });
    expect(jar.has("__Host-oh_gnonce")).toBe(false);
    expect(jar.has("__Host-oh_challenge")).toBe(true);

    const code = /\d{6}/.exec(mail[0].subject)?.[0];
    const verified = await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).set("Cookie", jar.header()).send({ code }).expect(200);
    expect(verified.body).toMatchObject({ step: "signed-in", returnTo: "/customers" });
  });

  it("answers the button's refusals as JSON", async () => {
    const app = testApp();
    const jar = new Jar().take(await request(app).get("/api/auth/google/nonce").expect(200));
    const post = (body: Record<string, unknown>) => request(app).post("/api/auth/google/credential").set("Origin", DASHBOARD).set("Cookie", jar.header()).send(body);
    expect((await post({ credential: "forged" }).expect(502)).body.code).toBe("GOOGLE_FAILED");
    identity = { sub: "stranger", email: "stranger@example.com", name: null };
    expect((await post({ credential: "id-token" }).expect(403)).body.code).toBe("NOT_REGISTERED");
    expect((await request(app).post("/api/auth/google/credential").send({ credential: "id-token" }).expect(403)).body.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("lands straight on the page on a remembered device", async () => {
    const app = testApp();
    const jar = new Jar();
    await throughGoogle(app, jar);
    const code = /\d{6}/.exec(mail[0].subject)?.[0];
    jar.take(await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).set("Cookie", jar.header()).send({ code }).expect(200));

    const { back } = await throughGoogle(app, jar, "remember=1&returnTo=%2Fgroups");
    expect(back.headers.location).toBe(`${DASHBOARD}/groups`);
    expect(jar.has("__Host-oh_session")).toBe(true);
    expect(mail).toHaveLength(1);
  });

  it("keeps the session cookie to the browser session without 'remember me'", async () => {
    const app = testApp();
    await db.query("UPDATE security_settings SET two_step_required = false");
    const jar = new Jar();
    const { back } = await throughGoogle(app, jar, "remember=0");
    expect(back.headers.location).toBe(`${DASHBOARD}/`);
    expect(jar.raw.get("__Host-oh_session")).toMatch(/^__Host-oh_session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict$/);
  });

  it("sends refusals back to the sign-in screen", async () => {
    const app = testApp();
    identity = { sub: "stranger", email: "stranger@example.com", name: null };
    expect((await throughGoogle(app, new Jar())).back.headers.location).toBe(`${DASHBOARD}/login?error=not-registered`);

    const noCookie = await request(app).get("/api/auth/google/callback?state=x&code=y").expect(302);
    expect(noCookie.headers.location).toBe(`${DASHBOARD}/login?error=google-failed`);

    const jar = new Jar();
    jar.take(await request(app).get("/api/auth/google").expect(302));
    const cancelled = await request(app).get("/api/auth/google/callback?error=access_denied").set("Cookie", jar.header()).expect(302);
    expect(cancelled.headers.location).toBe(`${DASHBOARD}/login?error=cancelled`);
  });

  it("refuses changes that don't come from the dashboard", async () => {
    const app = testApp();
    expect((await request(app).post("/api/auth/verify").send({ code: "123456" }).expect(403)).body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect((await request(app).post("/api/auth/verify").set("Origin", "https://n8n.example.com").send({ code: "123456" }).expect(403)).body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect((await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).send({ code: "123456" }).expect(401)).body.code).toBe("CHALLENGE_EXPIRED");
  });

  it("checks the code is 6 digits, spaces allowed", async () => {
    const app = testApp();
    expect((await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).send({ code: "12a456" }).expect(400)).body.code).toBe("VALIDATION_ERROR");
    expect((await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).send({ code: "123 456" }).expect(401)).body.code).toBe("CHALLENGE_EXPIRED");
    expect((await request(app).get("/api/auth/code").expect(401)).body.code).toBe("CHALLENGE_EXPIRED");
  });

  it("limits code attempts per IP", async () => {
    const app = testApp({ signInLimit: 2 });
    const attempt = () => request(app).post("/api/auth/verify").set("Origin", DASHBOARD).send({ code: "123456" });
    await attempt().expect(401);
    await attempt().expect(401);
    expect((await attempt().expect(429)).body.code).toBe("TOO_MANY_ATTEMPTS");
  });
});
