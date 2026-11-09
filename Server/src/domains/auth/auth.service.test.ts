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
  signInWithPassword,
  signOut,
  startGoogleButton,
  startGoogleSignIn,
  verifyCode,
  type AuthDeps,
  type DeviceContext,
  type SignInOutcome,
} from "./auth.service.js";
import { changeOwnPassword, disableStaff, inviteStaff, resetSignIn, setSignIn, setTwoStepExempt } from "./staff-accounts.service.js";

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

const PASSWORD = "uman-hanukkah-26";

/** Registered with a username and a first password from the office. */
async function registerWithPassword(options: { email?: string; username?: string | null; password?: string } = {}) {
  return inviteStaff(
    { db, dashboardUrl: "https://app.example.com", mailer, now: () => clock },
    {
      email: options.email ?? RONIT.email,
      name: "רונית ברש",
      role: "admin",
      passportAccess: true,
      whatsappPhone: null,
      username: options.username === undefined ? "ronit" : options.username,
      password: options.password ?? PASSWORD,
    },
  );
}

/** The username (or email) and password, as the sign-in screen sends them. */
function viaPassword(login: string, password: string, options: { remember?: boolean; returnTo?: string; device?: string | null } = {}) {
  return signInWithPassword(deps(), { login, password, remember: options.remember ?? false, returnTo: options.returnTo ?? "/" }, browser(options.device ?? null));
}

/** A password, then the emailed code. */
async function signedInWithPassword(options: { password?: string; remember?: boolean; device?: string | null } = {}) {
  const outcome = await viaPassword("ronit", options.password ?? PASSWORD, options);
  if (outcome.step !== "code-sent") throw new Error(`expected a code, got ${outcome.step}`);
  return verifyCode(deps(), { challengeToken: outcome.challengeToken, code: lastCode() }, browser(options.device ?? null));
}

/** "Continue with Google" through to Google's answer, as the browser would carry the cookie. */
async function viaGoogle(options: { identity?: GoogleIdentity; remember?: boolean; returnTo?: string; device?: string | null } = {}): Promise<SignInOutcome> {
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
    await expect(register("RONIT@example.com")).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_REGISTERED" });
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

  it("inviting a removed account again opens it as a new invite", async () => {
    await register();
    await signedIn();
    await disableStaff(accounts(), RONIT.email);
    await expect(register()).resolves.toMatchObject({ emailed: true });
    const { rows } = await db.query("SELECT disabled_at, google_sub FROM staff_users WHERE email = $1", [RONIT.email]);
    expect(rows).toEqual([{ disabled_at: null, google_sub: null }]);
    expect((await viaGoogle()).step).toBe("code-sent");
  });
});

// Every password check takes a few tenths of a second on purpose, so these get more time.
describe("password sign-in", { timeout: 30_000 }, () => {
  it("takes the username or the email, in any case, then the emailed code", async () => {
    await registerWithPassword();
    const outcome = await viaPassword(" Ronit ", PASSWORD, { returnTo: "/customers" });
    expect(outcome).toMatchObject({ step: "code-sent", returnTo: "/customers" });
    expect(mail.at(-1)?.to).toBe("ronit@example.com");
    if (outcome.step !== "code-sent") return;
    const result = await verifyCode(deps(), { challengeToken: outcome.challengeToken, code: lastCode() }, browser());
    expect(result).toMatchObject({ step: "signed-in", returnTo: "/customers" });
    expect(result.signedIn.user).toMatchObject({ name: "רונית ברש", role: "admin" });
    expect((await viaPassword("RONIT@example.com", PASSWORD)).step).toBe("code-sent");
  });

  it("gives the same answer for an unknown username, an account without a password, a wrong password and a removed account", async () => {
    await registerWithPassword();
    await register("shira@example.com", "שירה");
    for (const [login, password] of [
      ["nobody", PASSWORD],
      ["shira@example.com", PASSWORD],
      ["ronit", "not-the-password"],
    ]) {
      await expect(viaPassword(login, password)).rejects.toMatchObject({ code: "INVALID_LOGIN", statusCode: 401 });
    }
    await disableStaff({ db, dashboardUrl: "https://app.example.com", mailer, now: () => clock }, RONIT.email);
    await expect(viaPassword("ronit@example.com", PASSWORD)).rejects.toMatchObject({ code: "INVALID_LOGIN" });
  });

  it("locks password sign-in on the fifth wrong password, while Google still gets in", async () => {
    await registerWithPassword();
    for (let i = 0; i < 4; i++) await expect(viaPassword("ronit", "wrong-password")).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    await expect(viaPassword("ronit", "wrong-password")).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS", statusCode: 429 });
    await expect(viaPassword("ronit", PASSWORD)).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(await auditActions()).toContain("password-locked");
    expect((await viaGoogle()).step).toBe("code-sent");
    tick(15 * 60);
    expect((await viaPassword("ronit", PASSWORD)).step).toBe("code-sent");
  });

  it("starts the count again after a right password", async () => {
    await registerWithPassword();
    for (let i = 0; i < 4; i++) await expect(viaPassword("ronit", "wrong-password")).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    expect((await viaPassword("ronit", PASSWORD)).step).toBe("code-sent");
    for (let i = 0; i < 4; i++) await expect(viaPassword("ronit", "wrong-password")).rejects.toMatchObject({ code: "INVALID_LOGIN" });
  });

  it("checks parallel guesses one try at a time, so no more than five get checked", async () => {
    await registerWithPassword();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => viaPassword("ronit", "wrong-password")));
    const codes = results.map((result) => (result.status === "rejected" ? (result.reason as AppError).code : "signed-in"));
    expect(codes.filter((code) => code === "INVALID_LOGIN")).toHaveLength(4);
    expect(codes.filter((code) => code === "TOO_MANY_ATTEMPTS")).toHaveLength(4);
  });

  it("skips the code on a remembered device, and lands only inside the dashboard", async () => {
    await registerWithPassword();
    const { deviceToken } = await signedInWithPassword({ remember: true });
    expect(await viaPassword("ronit", PASSWORD, { remember: true, device: deviceToken, returnTo: "https://evil.example" })).toMatchObject({
      step: "signed-in",
      returnTo: "/",
    });
  });

  it("is refused while wrong codes have locked the account", async () => {
    await registerWithPassword();
    await db.query("UPDATE staff_users SET locked_until = $1", [new Date(clock.getTime() + 60_000)]);
    await expect(viaPassword("ronit", PASSWORD)).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });
});

describe("usernames and passwords", { timeout: 30_000 }, () => {
  const accounts = () => ({ db, dashboardUrl: "https://app.example.com", mailer, now: () => clock });

  it("an admin's new password signs the person out everywhere, and the old one stops working", async () => {
    const { userId } = await registerWithPassword();
    const { sessionToken, deviceToken } = await signedInWithPassword({ remember: true });
    await setSignIn(accounts(), userId, { password: "a-brand-new-one" });
    await expect(authenticate(deps(), sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(viaPassword("ronit", PASSWORD)).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    // The remembered device is forgotten too: the code comes again.
    expect((await viaPassword("ronit", "a-brand-new-one", { remember: true, device: deviceToken })).step).toBe("code-sent");
    expect(await auditActions()).toContain("password-set");
  });

  it("an admin setting their own password keeps the session they're in", async () => {
    const { userId } = await registerWithPassword();
    const here = await signedInWithPassword();
    tick(60);
    const elsewhere = await signedInWithPassword();
    await setSignIn(accounts(), userId, { password: "my-own-new-one" }, userId, here.sessionToken);
    await expect(authenticate(deps(), here.sessionToken)).resolves.toMatchObject({ user: { role: "admin" } });
    await expect(authenticate(deps(), elsewhere.sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("keeps usernames to the rules, in lower case, and one per person", async () => {
    const { userId } = await registerWithPassword();
    const shira = await registerWithPassword({ email: "shira@example.com", username: "shira" });
    for (const bad of ["ab", "1ronit", "ronit@home", "רונית", "ron it", "a".repeat(33)]) {
      await expect(setSignIn(accounts(), userId, { username: bad })).rejects.toMatchObject({ code: "INVALID_USERNAME", statusCode: 400 });
    }
    await expect(setSignIn(accounts(), shira.userId, { username: "RONIT" })).rejects.toMatchObject({ code: "USERNAME_TAKEN", statusCode: 409 });
    await expect(registerWithPassword({ email: "third@example.com", username: "Ronit" })).rejects.toMatchObject({ code: "USERNAME_TAKEN" });

    await setSignIn(accounts(), userId, { username: "Ronit.B" });
    expect((await viaPassword("ronit.b", PASSWORD)).step).toBe("code-sent");
    // Taken off: the email still works.
    await setSignIn(accounts(), userId, { username: "" });
    await expect(viaPassword("ronit.b", PASSWORD)).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    expect((await viaPassword("ronit@example.com", PASSWORD)).step).toBe("code-sent");
    expect((await auditActions()).filter((action) => action === "username-changed")).toHaveLength(2);
  });

  it("takes passwords of 8 to 128 characters", async () => {
    await expect(registerWithPassword({ password: "short" })).rejects.toMatchObject({ code: "WEAK_PASSWORD", statusCode: 400 });
    const { rows } = await db.query("SELECT 1 FROM staff_users");
    expect(rows).toHaveLength(0);
    const { userId } = await registerWithPassword({ password: "שמונה-תווים" });
    await expect(setSignIn(accounts(), userId, { password: "x".repeat(129) })).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    expect((await viaPassword("ronit", "שמונה-תווים")).step).toBe("code-sent");
  });

  it("changing your own password needs the current one, ends your other sessions, and emails you", async () => {
    const { userId } = await registerWithPassword();
    const here = await signedInWithPassword();
    tick(60);
    const elsewhere = await signedInWithPassword();
    const session = { sessionToken: here.sessionToken, deviceToken: null };
    await expect(changeOwnPassword(deps(), userId, session, { current: "wrong-one", next: "my-new-password" })).rejects.toMatchObject({
      code: "WRONG_PASSWORD",
      statusCode: 400,
    });
    await expect(changeOwnPassword(deps(), userId, session, { current: PASSWORD, next: "short" })).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    await changeOwnPassword(deps(), userId, session, { current: PASSWORD, next: "my-new-password" });
    await expect(authenticate(deps(), here.sessionToken)).resolves.toMatchObject({ user: { role: "admin" } });
    await expect(authenticate(deps(), elsewhere.sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mail.at(-1)).toMatchObject({ to: "ronit@example.com", subject: "הסיסמה שלך למערכת של אור הצדיק עודכנה" });
    expect(mail.at(-1)?.text).toContain("הסיסמה שלך למערכת הניהול של אור הצדיק שונתה.");
    expect(mail.at(-1)?.text).not.toContain("my-new-password");
    await expect(viaPassword("ronit", PASSWORD)).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    expect((await viaPassword("ronit", "my-new-password")).step).toBe("code-sent");
  });

  it("wrong current passwords count toward the lock", async () => {
    const { userId } = await registerWithPassword();
    const { sessionToken } = await signedInWithPassword();
    const change = () => changeOwnPassword(deps(), userId, { sessionToken, deviceToken: null }, { current: "wrong-one", next: "my-new-password" });
    for (let i = 0; i < 4; i++) await expect(change()).rejects.toMatchObject({ code: "WRONG_PASSWORD" });
    await expect(change()).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    await expect(viaPassword("ronit", PASSWORD)).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });

  it("a first password needs an admin: a signed-in browser can't give the account one", async () => {
    const { userId } = await register();
    const { sessionToken } = await signedIn();
    await expect(changeOwnPassword(deps(), userId, { sessionToken, deviceToken: null }, { current: "anything", next: "first-password" })).rejects.toMatchObject({
      code: "NO_PASSWORD",
      statusCode: 400,
    });
    await expect(viaPassword("ronit@example.com", "first-password")).rejects.toMatchObject({ code: "INVALID_LOGIN" });
  });

  it("an admin's new password emails the person, without the password", async () => {
    const { userId } = await registerWithPassword();
    await setSignIn({ ...accounts(), mailer }, userId, { password: "set-by-the-office" });
    expect(mail.at(-1)).toMatchObject({ to: "ronit@example.com", subject: "הסיסמה שלך למערכת של אור הצדיק עודכנה" });
    expect(mail.at(-1)?.text).toContain("המשרד הגדיר לך סיסמה חדשה");
    expect(mail.at(-1)?.html).not.toContain("set-by-the-office");
    // A username change alone sends nothing.
    const sent = mail.length;
    await setSignIn({ ...accounts(), mailer }, userId, { username: "ronit.b" });
    expect(mail).toHaveLength(sent);
  });

  it("a browser remembered for the person keeps its own count, so a stranger's guesses don't lock them out there", async () => {
    await registerWithPassword();
    const { deviceToken } = await signedInWithPassword({ remember: true });
    // A stranger, with no remembered browser, locks the account's count.
    for (let i = 0; i < 4; i++) await expect(viaPassword("ronit", "wrong-password")).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    await expect(viaPassword("ronit", "wrong-password")).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    await expect(viaPassword("ronit", PASSWORD)).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    // Ronit's own browser still gets in, straight to a session.
    expect((await viaPassword("ronit", PASSWORD, { remember: true, device: deviceToken })).step).toBe("signed-in");
    // Her browser's own count locks it after five wrong ones.
    for (let i = 0; i < 4; i++) await expect(viaPassword("ronit", "wrong-password", { remember: true, device: deviceToken })).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    await expect(viaPassword("ronit", "wrong-password", { remember: true, device: deviceToken })).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    await expect(viaPassword("ronit", PASSWORD, { remember: true, device: deviceToken })).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    // A browser cookie that isn't remembered for her counts on the account.
    await expect(viaPassword("ronit", PASSWORD, { device: "made-up-device" })).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });

  it("removing someone frees their username and drops their password", async () => {
    await registerWithPassword();
    await disableStaff(accounts(), RONIT.email);
    await expect(registerWithPassword({ email: "new@example.com", username: "ronit", password: "another-password" })).resolves.toMatchObject({ emailed: true });
    // Opened again under the old email, the account starts with no password.
    await register();
    await expect(viaPassword("ronit@example.com", PASSWORD)).rejects.toMatchObject({ code: "INVALID_LOGIN" });
  });

  it("names the username in the invite, never the password", async () => {
    await registerWithPassword();
    expect(mail.at(-1)?.text).toContain("שם המשתמש ronit");
    expect(mail.at(-1)?.text).not.toContain(PASSWORD);
    expect(mail.at(-1)?.html).not.toContain(PASSWORD);
  });
});

describe("a special account without the code", { timeout: 30_000 }, () => {
  const accounts = () => ({ db, dashboardUrl: "https://app.example.com", mailer, now: () => clock });
  const codesSent = () => mail.filter((message) => message.subject.startsWith("קוד הכניסה")).length;

  it("signs in with the password or Google alone, while everyone else still gets the code", async () => {
    await registerWithPassword();
    await registerWithPassword({ email: "shira@example.com", username: "shira" });
    await setTwoStepExempt(accounts(), "RONIT@example.com", true);
    expect((await viaPassword("ronit", PASSWORD)).step).toBe("signed-in");
    expect((await viaGoogle()).step).toBe("signed-in");
    expect(codesSent()).toBe(0);
    expect((await viaPassword("shira", PASSWORD)).step).toBe("code-sent");
    // Back to normal: the code again.
    await setTwoStepExempt(accounts(), RONIT.email, false);
    expect((await viaPassword("ronit", PASSWORD)).step).toBe("code-sent");
    expect((await auditActions()).filter((action) => action === "two-step-changed")).toHaveLength(2);
    // Setting it as it already is logs nothing; an unknown email is refused.
    await setTwoStepExempt(accounts(), RONIT.email, false);
    expect((await auditActions()).filter((action) => action === "two-step-changed")).toHaveLength(2);
    await expect(setTwoStepExempt(accounts(), "nobody@example.com", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("still locks password sign-in after five wrong passwords", async () => {
    await registerWithPassword();
    await setTwoStepExempt(accounts(), RONIT.email, true);
    for (let i = 0; i < 4; i++) await expect(viaPassword("ronit", "wrong-password")).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    await expect(viaPassword("ronit", "wrong-password")).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    await expect(viaPassword("ronit", PASSWORD)).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });
});
