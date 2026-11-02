import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

// Real scrypt takes ~150 ms a hash and these tests hash dozens of times, so they hash cheaply;
// lib/password.test.ts covers the real cost. verifyPassword reads the cost from each hash.
vi.mock("../../lib/password.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/password.js")>();
  return { ...real, hashPassword: (password: string) => real.hashPassword(password, { N: 2 ** 10, r: 8, p: 1 }) };
});

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { globalErrorHandler } from "../../lib/errors.js";
import { base32Decode, totpCode } from "../../lib/totp.js";
import { createAuthRouter } from "./auth.routes.js";
import type { AuthDeps } from "./auth.service.js";
import { inviteStaff } from "./staff-accounts.service.js";

const DASHBOARD = "https://app.example.com";
const PASSWORD = "Shalom Jerusalem 7";

let db: TestDb;
let clock: Date;

const deps = (): AuthDeps => ({ db, secretKey: Buffer.alloc(32, 9), dashboardUrl: DASHBOARD, now: () => clock });

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

async function inviteToken(): Promise<string> {
  const { link } = await inviteStaff(deps(), { email: "ronit@example.com", name: "רונית ברש", role: "admin", passportAccess: true, whatsappPhone: null });
  return link.split("/setup/")[1];
}

beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
  clock = new Date("2026-11-02T10:00:00Z");
});

describe("/api/auth", () => {
  it("takes an invite through the codes to a session, and signs out", async () => {
    const app = testApp();
    const jar = new Jar();
    const token = await inviteToken();

    const link = await request(app).get(`/api/auth/setup-links/${token}`).expect(200);
    expect(link.body).toEqual({ status: "ok", link: { name: "רונית ברש", email: "ronit@example.com", purpose: "invite" } });
    expect(link.headers["cache-control"]).toBe("no-store");

    const setup = await request(app)
      .post(`/api/auth/setup-links/${token}`)
      .set("Origin", DASHBOARD)
      .send({ password: PASSWORD, remember: true })
      .expect(200);
    expect(setup.body).toMatchObject({ status: "ok", step: "setup-required", setup: { secret: expect.any(String), otpauthUrl: expect.stringMatching(/^otpauth:\/\/totp\//) } });
    jar.take(setup);
    expect(jar.raw.get("__Host-oh_challenge")).toMatch(/; Max-Age=600; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Strict$/);

    const code = totpCode(base32Decode(setup.body.setup.secret), clock);
    const signedIn = await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).set("Cookie", jar.header()).send({ code }).expect(200);
    jar.take(signedIn);
    expect(signedIn.body).toEqual({
      status: "ok",
      step: "signed-in",
      session: { userId: expect.any(String), signedInAt: clock.toISOString() },
      user: { id: signedIn.body.session.userId, name: "רונית ברש", initial: "ר", role: "admin", passportAccess: true },
    });
    expect(jar.has("__Host-oh_challenge")).toBe(false);
    expect(jar.raw.get("__Host-oh_session")).toMatch(/; Max-Age=2592000; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Strict$/);
    expect(jar.raw.get("__Host-oh_device")).toMatch(/; Max-Age=31536000; .*HttpOnly; Secure; SameSite=Strict$/);

    const session = await request(app).get("/api/auth/session").set("Cookie", jar.header()).expect(200);
    expect(session.body).toEqual({ status: "ok", session: signedIn.body.session, user: signedIn.body.user });

    const beforeSignOut = jar.header();
    jar.take(await request(app).post("/api/auth/sign-out").set("Origin", DASHBOARD).set("Cookie", jar.header()).expect(200));
    expect(jar.has("__Host-oh_session")).toBe(false);
    expect(jar.has("__Host-oh_device")).toBe(true);
    // The old cookie, replayed, is dead on the server too.
    const after = await request(app).get("/api/auth/session").set("Cookie", beforeSignOut).expect(401);
    expect(after.body).toMatchObject({ status: "error", code: "UNAUTHENTICATED" });
  });

  it("keeps the session cookie to the browser session without 'remember me'", async () => {
    const app = testApp();
    await db.query("UPDATE security_settings SET two_step_required = false");
    const token = await inviteToken();
    const res = await request(app).post(`/api/auth/setup-links/${token}`).set("Origin", DASHBOARD).send({ password: PASSWORD, remember: false }).expect(200);
    const cookie = new Jar().take(res).raw.get("__Host-oh_session");
    expect(cookie).toMatch(/^__Host-oh_session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict$/);
  });

  it("refuses changes that don't come from the dashboard", async () => {
    const app = testApp();
    const body = { email: "ronit@example.com", password: PASSWORD };
    expect((await request(app).post("/api/auth/sign-in").send(body).expect(403)).body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect((await request(app).post("/api/auth/sign-in").set("Origin", "https://n8n.example.com").send(body).expect(403)).body.code).toBe("ORIGIN_NOT_ALLOWED");
    await request(app).post("/api/auth/sign-in").set("Origin", DASHBOARD).send(body).expect(401);
  });

  it("answers 401 without a session, and clears a dead session cookie", async () => {
    const app = testApp();
    expect((await request(app).get("/api/auth/session").expect(401)).body.code).toBe("UNAUTHENTICATED");
    const res = await request(app).get("/api/auth/session").set("Cookie", "__Host-oh_session=stale").expect(401);
    expect(new Jar().take(res).raw.get("__Host-oh_session")).toMatch(/^__Host-oh_session=; Path=\/; Expires=Thu, 01 Jan 1970/);
  });

  it("checks the body: a 6-digit code, spaces allowed", async () => {
    const app = testApp();
    expect((await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).send({ code: "12a456" }).expect(400)).body.code).toBe("VALIDATION_ERROR");
    expect((await request(app).post("/api/auth/verify").set("Origin", DASHBOARD).send({ code: "123 456" }).expect(401)).body.code).toBe("CHALLENGE_EXPIRED");
    expect((await request(app).get("/api/auth/setup-links/short").expect(400)).body.code).toBe("VALIDATION_ERROR");
    expect((await request(app).get(`/api/auth/setup-links/${"x".repeat(43)}`).expect(404)).body.code).toBe("LINK_INVALID");
  });

  it("limits sign-in attempts per IP", async () => {
    const app = testApp({ signInLimit: 2 });
    const attempt = () => request(app).post("/api/auth/sign-in").set("Origin", DASHBOARD).send({ email: "a@example.com", password: "whatever" });
    await attempt().expect(401);
    await attempt().expect(401);
    expect((await attempt().expect(429)).body.code).toBe("TOO_MANY_ATTEMPTS");
  });
});
