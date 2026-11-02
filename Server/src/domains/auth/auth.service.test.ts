import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { AppError } from "../../lib/errors.js";
import type { GoogleIdentity, GoogleSignIn } from "../../lib/google-oidc.js";
import type { MailMessage, Mailer } from "../../lib/mailer.js";
import {
  authenticate,
  finishGoogleButton,
  finishGoogleSignIn,
  maskEmail,
  pendingCode,
  resendCode,
  safeReturnTo,
  signOut,
  startGoogleButton,
  startGoogleSignIn,
  verifyCode,
  type AuthDeps,
  type DeviceContext,
  type GoogleOutcome,
} from "./auth.service.js";
import { disableStaff, inviteStaff, resetSignIn } from "./staff-accounts.service.js";

const RONIT: GoogleIdentity = { sub: "google-ronit", email: "ronit@example.com", name: "Ronit Barash" };

let db: TestDb;
let clock: Date;
let mail: MailMessage[];
let mailFails: boolean;

const mailer: Mailer = {
  async send(message) {
    if (mailFails) throw new AppError(502, "SMTP is down", "EMAIL_FAILED");
    mail.push(message);
  },
};

/** The nonces Google's button was checked against, newest last. */
let buttonNonces: string[];

/**
 * Google as the tests need it: the code "refused" and the credential "forged" fail; anything
 * else signs in as `identity`.
 */
function fakeGoogle(identity: GoogleIdentity): GoogleSignIn {
  return {
    authorizeUrl: ({ state, nonce, codeChallenge }) => `https://accounts.example/auth?state=${state}&nonce=${nonce}&challenge=${codeChallenge}`,
    async exchange({ code }) {
      if (code === "refused") throw new AppError(502, "Google sign-in failed: invalid_grant", "GOOGLE_FAILED");
      return identity;
    },
    async verifyCredential({ credential, nonce }) {
      if (credential === "forged") throw new AppError(502, "Google sign-in failed: bad token signature", "GOOGLE_FAILED");
      buttonNonces.push(nonce);
      return identity;
    },
  };
}

const deps = (identity: GoogleIdentity = RONIT): AuthDeps => ({
  db,
  secretKey: Buffer.alloc(32, 7),
  dashboardUrl: "https://app.example.com",
  google: fakeGoogle(identity),
  mailer,
  now: () => clock,
});
const browser = (deviceToken: string | null = null): DeviceContext => ({ deviceToken, ip: "203.0.113.5", userAgent: "Vitest" });
const tick = (seconds: number) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};
const lastCode = () => /\d{6}/.exec(mail.at(-1)?.subject ?? "")?.[0] ?? "";

async function register(email = RONIT.email, name = "רונית ברש") {
  return inviteStaff({ db, dashboardUrl: "https://app.example.com", mailer, now: () => clock }, { email, name, role: "admin", passportAccess: true, whatsappPhone: null });
}

/** "Continue with Google" through to Google's answer, as the browser would carry the cookie. */
async function viaGoogle(options: { identity?: GoogleIdentity; remember?: boolean; returnTo?: string; device?: string | null } = {}): Promise<GoogleOutcome> {
  const d = deps(options.identity);
  const start = startGoogleSignIn(d, { remember: options.remember ?? false, returnTo: options.returnTo ?? "/" });
  const state = new URL(start.redirectUrl).searchParams.get("state");
  return finishGoogleSignIn(d, { googleStep: start.googleStep, state, code: "code-1", error: null }, browser(options.device ?? null));
}

/** Google, then the emailed code. */
async function signedIn(options: { remember?: boolean; device?: string | null } = {}) {
  const outcome = await viaGoogle(options);
  if (outcome.step !== "code-sent") throw new Error(`expected a code, got ${outcome.step}`);
  return verifyCode(deps(), { challengeToken: outcome.challengeToken, code: lastCode() }, browser(options.device ?? null));
}

/** A sealed cookie value with one bit of its ciphertext flipped. */
function tamper(sealed: string): string {
  const parts = sealed.split(".");
  const body = Buffer.from(parts[3], "base64url");
  body[0] ^= 1;
  parts[3] = body.toString("base64url");
  return parts.join(".");
}

async function auditActions(): Promise<string[]> {
  const { rows } = await db.query<{ action: string }>("SELECT action FROM audit_log ORDER BY at, action");
  return rows.map((row) => row.action);
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
  mail = [];
  mailFails = false;
  buttonNonces = [];
});

describe("Google sign-in", () => {
  it("turns away a Google account nobody registered, and logs it", async () => {
    await expect(viaGoogle()).rejects.toMatchObject({ code: "NOT_REGISTERED", statusCode: 403 });
    expect(await auditActions()).toEqual(["sign-in-refused"]);
    expect(mail).toEqual([]);
  });

  it("emails a code to a registered person, then signs them in with it", async () => {
    await register();
    expect(mail.map((m) => [m.to, m.subject])).toEqual([["ronit@example.com", "נפתח לך חשבון במערכת של אור הצדיק"]]);
    const outcome = await viaGoogle({ returnTo: "/customers" });
    expect(outcome).toMatchObject({ step: "code-sent", returnTo: "/customers" });
    if (outcome.step !== "code-sent") return;
    expect(mail.at(-1)?.to).toBe("ronit@example.com");
    await expect(pendingCode(deps(), outcome.challengeToken)).resolves.toEqual({ email: "r***@example.com" });

    const result = await verifyCode(deps(), { challengeToken: outcome.challengeToken, code: lastCode() }, browser());
    expect(result).toMatchObject({ step: "signed-in", returnTo: "/customers", remember: false });
    expect(result.signedIn.user).toMatchObject({ name: "רונית ברש", initial: "ר", role: "admin", passportAccess: true });
    expect((await auditActions()).sort()).toEqual(["new-device-sign-in", "staff-invited"]);
  });

  it("links the first Google account to the email, and refuses another one later", async () => {
    await register();
    await signedIn();
    await expect(viaGoogle({ identity: { ...RONIT, sub: "someone-else" } })).rejects.toMatchObject({ code: "NOT_REGISTERED" });
    // The linked account still gets in after its Google email changes.
    expect((await viaGoogle({ identity: { ...RONIT, email: "ronit.new@example.com" } })).step).toBe("code-sent");
    expect(mail.at(-1)?.to).toBe("ronit@example.com");
  });

  it("refuses an answer that doesn't belong to this browser's sign-in", async () => {
    await register();
    const d = deps();
    const start = startGoogleSignIn(d, { remember: false, returnTo: "/" });
    const state = new URL(start.redirectUrl).searchParams.get("state");
    const finish = (input: Partial<Parameters<typeof finishGoogleSignIn>[1]>) =>
      finishGoogleSignIn(d, { googleStep: start.googleStep, state, code: "code-1", error: null, ...input }, browser());
    await expect(finish({ state: "forged" })).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
    await expect(finish({ googleStep: null })).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
    await expect(finish({ googleStep: tamper(start.googleStep) })).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
    await expect(finish({ code: "refused" })).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
    await expect(finish({ error: "access_denied", code: null })).rejects.toMatchObject({ code: "GOOGLE_CANCELLED" });
    tick(10 * 60 + 1);
    await expect(finish({})).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
  });

  it("leaves no step behind when the code can't be emailed", async () => {
    await register();
    mailFails = true;
    await expect(viaGoogle()).rejects.toMatchObject({ code: "EMAIL_FAILED" });
    const { rows } = await db.query("SELECT 1 FROM staff_sign_in_challenges");
    expect(rows).toHaveLength(0);
  });

  it("signs in with Google alone when the two-step switch is off", async () => {
    await register();
    await db.query("UPDATE security_settings SET two_step_required = false");
    expect((await viaGoogle()).step).toBe("signed-in");
  });

  it("only lands on pages inside the dashboard", () => {
    expect(safeReturnTo("/customers/c1?tab=passport")).toBe("/customers/c1?tab=passport");
    for (const bad of ["https://evil.example", "//evil.example", "/\t/evil.example", "/\\evil.example", "/login", "customers", 7]) {
      expect(safeReturnTo(bad)).toBe("/");
    }
    expect(maskEmail("ronit@gmail.com")).toBe("r***@gmail.com");
  });
});

describe("Google's button", () => {
  it("checks the token against this browser's nonce, then emails the code", async () => {
    await register();
    const { nonce, googleNonce } = startGoogleButton(deps());
    const outcome = await finishGoogleButton(deps(), { googleNonce, credential: "id-token", remember: true, returnTo: "/groups" }, browser());
    expect(buttonNonces).toEqual([nonce]);
    expect(outcome).toMatchObject({ step: "code-sent", returnTo: "/groups" });
    if (outcome.step !== "code-sent") return;
    const signedIn = await verifyCode(deps(), { challengeToken: outcome.challengeToken, code: lastCode() }, browser());
    expect(signedIn).toMatchObject({ step: "signed-in", remember: true, returnTo: "/groups" });
  });

  it("refuses an answer without this browser's nonce, a forged one, or after 30 minutes", async () => {
    await register();
    const { googleNonce } = startGoogleButton(deps());
    const finish = (input: Partial<Parameters<typeof finishGoogleButton>[1]>) =>
      finishGoogleButton(deps(), { googleNonce, credential: "id-token", remember: false, returnTo: "/", ...input }, browser());
    await expect(finish({ googleNonce: null })).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
    await expect(finish({ googleNonce: tamper(googleNonce) })).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
    await expect(finish({ credential: "forged" })).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
    tick(30 * 60 + 1);
    await expect(finish({})).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
  });

  it("turns away an unregistered account, and lands only inside the dashboard", async () => {
    const { googleNonce } = startGoogleButton(deps());
    await expect(finishGoogleButton(deps(), { googleNonce, credential: "id-token", remember: false, returnTo: "/" }, browser())).rejects.toMatchObject({ code: "NOT_REGISTERED" });
    await register();
    await db.query("UPDATE security_settings SET two_step_required = false");
    const outcome = await finishGoogleButton(deps(), { googleNonce, credential: "id-token", remember: false, returnTo: "https://evil.example" }, browser());
    expect(outcome).toMatchObject({ step: "signed-in", returnTo: "/" });
  });
});

describe("the emailed code", () => {
  it("works once, and the step ends after 10 minutes", async () => {
    await register();
    const first = await viaGoogle();
    if (first.step !== "code-sent") throw new Error("expected a code");
    const code = lastCode();
    await verifyCode(deps(), { challengeToken: first.challengeToken, code }, browser());
    await expect(verifyCode(deps(), { challengeToken: first.challengeToken, code }, browser())).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });

    const late = await viaGoogle();
    if (late.step !== "code-sent") throw new Error("expected a code");
    tick(10 * 60 + 1);
    await expect(pendingCode(deps(), late.challengeToken)).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    await expect(verifyCode(deps(), { challengeToken: late.challengeToken, code: lastCode() }, browser())).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    await expect(verifyCode(deps(), { challengeToken: null, code: "123456" }, browser())).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
  });

  it("locks the account on the fifth wrong code", async () => {
    await register();
    const outcome = await viaGoogle();
    if (outcome.step !== "code-sent") throw new Error("expected a code");
    const wrong = lastCode() === "000000" ? "000001" : "000000";
    for (let i = 0; i < 4; i++) {
      await expect(verifyCode(deps(), { challengeToken: outcome.challengeToken, code: wrong }, browser())).rejects.toMatchObject({ code: "INVALID_CODE" });
    }
    await expect(verifyCode(deps(), { challengeToken: outcome.challengeToken, code: wrong }, browser())).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS", statusCode: 429 });
    await expect(verifyCode(deps(), { challengeToken: outcome.challengeToken, code: lastCode() }, browser())).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    await expect(viaGoogle()).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(await auditActions()).toContain("sign-in-locked");
    tick(15 * 60);
    expect((await viaGoogle()).step).toBe("code-sent");
  });

  it("sends a new code a minute after the last, three in all, and the old one stops working", async () => {
    await register();
    const outcome = await viaGoogle();
    if (outcome.step !== "code-sent") throw new Error("expected a code");
    const firstCode = lastCode();
    await expect(resendCode(deps(), outcome.challengeToken)).rejects.toMatchObject({ code: "RESEND_TOO_SOON" });
    tick(60);
    await resendCode(deps(), outcome.challengeToken);
    tick(60);
    await resendCode(deps(), outcome.challengeToken);
    tick(60);
    await expect(resendCode(deps(), outcome.challengeToken)).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    expect(mail.filter((m) => m.subject.startsWith("קוד הכניסה"))).toHaveLength(3);
    if (firstCode !== lastCode()) {
      await expect(verifyCode(deps(), { challengeToken: outcome.challengeToken, code: firstCode }, browser())).rejects.toMatchObject({ code: "INVALID_CODE" });
    }
    await expect(verifyCode(deps(), { challengeToken: outcome.challengeToken, code: lastCode() }, browser())).resolves.toMatchObject({ step: "signed-in" });
  });
});

describe("remembered devices", () => {
  it("skips the code for 30 days on a device remembered at sign-in", async () => {
    await register();
    const { deviceToken } = await signedIn({ remember: true });
    expect((await viaGoogle({ remember: true, device: deviceToken })).step).toBe("signed-in");
    expect((await viaGoogle({ remember: true, device: "another-browser" })).step).toBe("code-sent");
    tick(30 * 24 * 3600 + 1);
    expect((await viaGoogle({ remember: true, device: deviceToken })).step).toBe("code-sent");
  });

  it("forgets the device when 'remember me' is unticked", async () => {
    await register();
    const { deviceToken } = await signedIn({ remember: true });
    expect((await viaGoogle({ remember: false, device: deviceToken })).step).toBe("signed-in");
    expect((await viaGoogle({ remember: false, device: deviceToken })).step).toBe("code-sent");
  });

  it("logs a new device once per browser and person", async () => {
    await register();
    const laptop = (await signedIn()).deviceToken;
    tick(60);
    expect((await signedIn({ device: laptop })).deviceToken).toBe(laptop);
    tick(60);
    await signedIn();
    expect((await auditActions()).filter((action) => action === "new-device-sign-in")).toHaveLength(2);
  });
});

describe("authenticate", () => {
  it("ends a session after 30 minutes without requests", async () => {
    await register();
    const { sessionToken } = await signedIn();
    tick(29 * 60);
    await expect(authenticate(deps(), sessionToken)).resolves.toMatchObject({ user: { name: "רונית ברש" } });
    tick(29 * 60);
    await expect(authenticate(deps(), sessionToken)).resolves.toMatchObject({ user: { name: "רונית ברש" } });
    tick(31 * 60);
    await expect(authenticate(deps(), sessionToken)).rejects.toMatchObject({ code: "SESSION_EXPIRED", statusCode: 401 });
    await expect(authenticate(deps(), sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("ends a session after 12 hours, or 30 days with 'remember me', when the automatic sign-out is off", async () => {
    await register();
    await db.query("UPDATE security_settings SET auto_sign_out = false");
    const short = await signedIn();
    tick(60);
    const remembered = await signedIn({ remember: true });
    tick(12 * 3600);
    await expect(authenticate(deps(), short.sessionToken)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await expect(authenticate(deps(), remembered.sessionToken)).resolves.toMatchObject({ user: { role: "admin" } });
    tick(30 * 24 * 3600);
    await expect(authenticate(deps(), remembered.sessionToken)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("refuses a missing, unknown or signed-out session", async () => {
    await register();
    const { sessionToken } = await signedIn();
    await expect(authenticate(deps(), null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticate(deps(), "not-a-session")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await signOut(deps(), sessionToken);
    await expect(authenticate(deps(), sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("account care", () => {
  const accounts = () => ({ db, dashboardUrl: "https://app.example.com", mailer, now: () => clock });

  it("refuses a second account with the same email, in any case", async () => {
    await register();
    await expect(register("RONIT@example.com")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("still registers the person when the invite can't be emailed", async () => {
    mailFails = true;
    await expect(register()).resolves.toMatchObject({ emailed: false });
    mailFails = false;
    expect((await viaGoogle()).step).toBe("code-sent");
  });

  it("resetting sign-in unlinks Google, forgets devices and ends sessions", async () => {
    await register();
    const { sessionToken, deviceToken } = await signedIn({ remember: true });
    await resetSignIn(accounts(), RONIT.email);
    await expect(authenticate(deps(), sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    // A replaced Google account under the same email is linked now, and the old device isn't trusted.
    expect((await viaGoogle({ identity: { ...RONIT, sub: "new-phone-account" }, device: deviceToken })).step).toBe("code-sent");
  });

  it("a disabled account is turned away, and its sessions end", async () => {
    await register();
    const { sessionToken } = await signedIn();
    await disableStaff(accounts(), RONIT.email);
    await expect(authenticate(deps(), sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(viaGoogle()).rejects.toMatchObject({ code: "NOT_REGISTERED" });
    await expect(resetSignIn(accounts(), "nobody@example.com")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
