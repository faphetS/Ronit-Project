import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Real scrypt takes ~150 ms a hash and these tests hash dozens of times, so they hash cheaply;
// lib/password.test.ts covers the real cost. verifyPassword reads the cost from each hash.
vi.mock("../../lib/password.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/password.js")>();
  return { ...real, hashPassword: (password: string) => real.hashPassword(password, { N: 2 ** 10, r: 8, p: 1 }) };
});

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { base32Decode, totpCode } from "../../lib/totp.js";
import {
  authenticate,
  completeSetupLink,
  readSetupLink,
  signIn,
  signOut,
  verifyCode,
  type AuthDeps,
  type DeviceContext,
  type SignInOutcome,
} from "./auth.service.js";
import { disableStaff, inviteStaff, issueResetLink, resetTwoStep } from "./staff-accounts.service.js";

const KEY = Buffer.alloc(32, 7);
const PASSWORD = "Shalom Jerusalem 7";
const EMAIL = "ronit@example.com";

let db: TestDb;
let clock: Date;

const deps = (): AuthDeps => ({ db, secretKey: KEY, dashboardUrl: "https://app.example.com/", now: () => clock });
const browser = (deviceToken: string | null = null): DeviceContext => ({ deviceToken, ip: "203.0.113.5", userAgent: "Vitest" });
/** Moves the clock on. Codes are 30-second windows, and each one works once. */
const tick = (seconds: number) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};

function expectStep<S extends SignInOutcome["step"]>(outcome: SignInOutcome, step: S): Extract<SignInOutcome, { step: S }> {
  expect(outcome.step).toBe(step);
  return outcome as Extract<SignInOutcome, { step: S }>;
}

async function invite(email = EMAIL): Promise<string> {
  const { link } = await inviteStaff(deps(), { email, name: "רונית ברש", role: "admin", passportAccess: true, whatsappPhone: null });
  return link.split("/setup/")[1];
}

/** An invited person who chose a password and set up their codes. */
async function enrolled(email = EMAIL, remember = false) {
  const token = await invite(email);
  const setup = expectStep(await completeSetupLink(deps(), { token, password: PASSWORD, remember }, browser()), "setup-required");
  const secret = base32Decode(setup.setup.secret);
  const signedIn = await verifyCode(deps(), { challengeToken: setup.challengeToken, code: totpCode(secret, clock) }, browser());
  tick(30);
  return { secret, signedIn };
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
});

describe("invite links", () => {
  it("points at the dashboard and says who it's for", async () => {
    const { link } = await inviteStaff(deps(), { email: " Ronit@Example.com ", name: "רונית ברש", role: "admin", passportAccess: true, whatsappPhone: null });
    expect(link).toMatch(/^https:\/\/app\.example\.com\/setup\/[\w-]{43}$/);
    await expect(readSetupLink(deps(), link.split("/setup/")[1])).resolves.toEqual({ name: "רונית ברש", email: EMAIL, purpose: "invite" });
  });

  it("refuses a second account with the same email", async () => {
    await invite();
    await expect(invite("RONIT@example.com")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a weak password and keeps the link usable", async () => {
    const token = await invite();
    await expect(completeSetupLink(deps(), { token, password: "short", remember: false }, browser())).rejects.toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    await expect(completeSetupLink(deps(), { token, password: EMAIL, remember: false }, browser())).rejects.toMatchObject({ code: "PASSWORD_SAME_AS_EMAIL" });
    await expect(readSetupLink(deps(), token)).resolves.toMatchObject({ purpose: "invite" });
  });

  it("sets the password, then asks to set up the codes, which switch on with the first good code", async () => {
    const token = await invite();
    const setup = expectStep(await completeSetupLink(deps(), { token, password: PASSWORD, remember: false }, browser()), "setup-required");
    expect(setup.setup.otpauthUrl).toBe(`otpauth://totp/Or%20HaTzadik:ronit%40example.com?secret=${setup.setup.secret}&issuer=Or%20HaTzadik&algorithm=SHA1&digits=6&period=30`);

    const secret = base32Decode(setup.setup.secret);
    await expect(verifyCode(deps(), { challengeToken: setup.challengeToken, code: "000000" }, browser())).rejects.toMatchObject({ code: "INVALID_CODE" });
    const signedIn = await verifyCode(deps(), { challengeToken: setup.challengeToken, code: totpCode(secret, clock) }, browser());

    expect(signedIn.signedIn.user).toMatchObject({ name: "רונית ברש", initial: "ר", role: "admin", passportAccess: true });
    expect(signedIn.signedIn.session.signedInAt).toBe(clock.toISOString());
    // Same clock for all four, so compared in name order.
    expect(await auditActions()).toEqual(["new-device-sign-in", "password-set", "staff-invited", "two-step-set-up"]);
    await expect(readSetupLink(deps(), token)).rejects.toMatchObject({ code: "LINK_INVALID" });
  });

  it("expires after 72 hours, and a newer link replaces an older one", async () => {
    const first = await invite();
    const { rows } = await db.query<{ id: string }>("SELECT id FROM staff_users");
    expect(rows).toHaveLength(1);
    const second = (await issueResetLink(deps(), EMAIL)).split("/setup/")[1];
    await expect(readSetupLink(deps(), first)).rejects.toMatchObject({ code: "LINK_INVALID" });
    tick(24 * 3600 + 1);
    await expect(readSetupLink(deps(), second)).rejects.toMatchObject({ code: "LINK_INVALID" });
  });
});

describe("signIn", () => {
  it("gives the same answer for an unknown email and a wrong password", async () => {
    await enrolled();
    await expect(signIn(deps(), { email: "nobody@example.com", password: PASSWORD, remember: false }, browser())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", statusCode: 401 });
    await expect(signIn(deps(), { email: EMAIL, password: "Wrong password 1", remember: false }, browser())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", statusCode: 401 });
  });

  it("asks for the code, ignoring the email's case", async () => {
    const { secret } = await enrolled();
    const step = expectStep(await signIn(deps(), { email: " RONIT@example.com", password: PASSWORD, remember: false }, browser()), "code-required");
    const signedIn = await verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser());
    expect(signedIn.signedIn.user.name).toBe("רונית ברש");
  });

  it("locks the account for 15 minutes after five wrong passwords", async () => {
    await enrolled();
    const attempt = (password: string) => signIn(deps(), { email: EMAIL, password, remember: false }, browser());
    for (let i = 0; i < 4; i++) await expect(attempt("Wrong password 1")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(attempt("Wrong password 1")).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS", statusCode: 429 });
    await expect(attempt(PASSWORD)).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(await auditActions()).toContain("sign-in-locked");
    tick(15 * 60);
    expect((await attempt(PASSWORD)).step).toBe("code-required");
  });

  it("lets the password alone in when the codes aren't required and not set up", async () => {
    await db.query("UPDATE security_settings SET two_step_required = false");
    const token = await invite();
    expectStep(await completeSetupLink(deps(), { token, password: PASSWORD, remember: false }, browser()), "signed-in");
    expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser()), "signed-in");
  });
});

describe("verifyCode", () => {
  it("accepts each code once", async () => {
    const { secret } = await enrolled();
    const first = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser()), "code-required");
    const code = totpCode(secret, clock);
    await verifyCode(deps(), { challengeToken: first.challengeToken, code }, browser());
    const second = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser()), "code-required");
    await expect(verifyCode(deps(), { challengeToken: second.challengeToken, code }, browser())).rejects.toMatchObject({ code: "INVALID_CODE" });
    tick(30);
    await expect(verifyCode(deps(), { challengeToken: second.challengeToken, code: totpCode(secret, clock) }, browser())).resolves.toMatchObject({ step: "signed-in" });
  });

  it("works once per step, and ends the step after 10 minutes", async () => {
    const { secret } = await enrolled();
    const step = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser()), "code-required");
    await verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser());
    tick(30);
    await expect(verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser())).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });

    const late = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser()), "code-required");
    tick(10 * 60 + 1);
    await expect(verifyCode(deps(), { challengeToken: late.challengeToken, code: totpCode(secret, clock) }, browser())).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    await expect(verifyCode(deps(), { challengeToken: null, code: "123456" }, browser())).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
  });

  it("locks the account on the fifth wrong code", async () => {
    const { secret } = await enrolled();
    const step = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser()), "code-required");
    const wrong = totpCode(secret, new Date(clock.getTime() + 10 * 60_000));
    for (let i = 0; i < 4; i++) {
      await expect(verifyCode(deps(), { challengeToken: step.challengeToken, code: wrong }, browser())).rejects.toMatchObject({ code: "INVALID_CODE" });
    }
    await expect(verifyCode(deps(), { challengeToken: step.challengeToken, code: wrong }, browser())).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    await expect(verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser())).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    await expect(signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser())).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });
});

describe("remembered devices", () => {
  it("skips the code for 30 days on a device remembered at sign-in", async () => {
    const { secret } = await enrolled();
    const step = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: true }, browser()), "code-required");
    const { deviceToken } = await verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser());

    expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: true }, browser(deviceToken)), "signed-in");
    expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: true }, browser("another-browser")), "code-required");
    tick(30 * 24 * 3600 + 1);
    expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: true }, browser(deviceToken)), "code-required");
  });

  it("forgets the device when 'remember me' is unticked", async () => {
    const { secret } = await enrolled();
    const step = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: true }, browser()), "code-required");
    const { deviceToken } = await verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser());
    expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser(deviceToken)), "signed-in");
    expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser(deviceToken)), "code-required");
  });

  it("logs a new device once per browser and person", async () => {
    const { secret } = await enrolled();
    const sign = async (deviceToken: string | null) => {
      tick(30);
      const step = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser(deviceToken)), "code-required");
      return (await verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser(deviceToken))).deviceToken;
    };
    const laptop = await sign(null);
    expect(await sign(laptop)).toBe(laptop);
    await sign(null);
    expect((await auditActions()).filter((action) => action === "new-device-sign-in")).toHaveLength(3);
  });
});

describe("authenticate", () => {
  it("ends a session after 30 minutes without requests", async () => {
    const { signedIn } = await enrolled();
    tick(29 * 60);
    await expect(authenticate(deps(), signedIn.sessionToken)).resolves.toMatchObject({ user: { name: "רונית ברש" } });
    tick(29 * 60);
    await expect(authenticate(deps(), signedIn.sessionToken)).resolves.toMatchObject({ user: { name: "רונית ברש" } });
    tick(31 * 60);
    await expect(authenticate(deps(), signedIn.sessionToken)).rejects.toMatchObject({ code: "SESSION_EXPIRED", statusCode: 401 });
    await expect(authenticate(deps(), signedIn.sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("ends a session after 12 hours, or 30 days with 'remember me', when the automatic sign-out is off", async () => {
    await db.query("UPDATE security_settings SET auto_sign_out = false");
    const { secret, signedIn } = await enrolled();
    const step = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: true }, browser()), "code-required");
    const remembered = await verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser());
    tick(12 * 3600);
    await expect(authenticate(deps(), signedIn.sessionToken)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await expect(authenticate(deps(), remembered.sessionToken)).resolves.toMatchObject({ user: { role: "admin" } });
    tick(30 * 24 * 3600);
    await expect(authenticate(deps(), remembered.sessionToken)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("refuses a missing, unknown or signed-out session", async () => {
    const { signedIn } = await enrolled();
    await expect(authenticate(deps(), null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticate(deps(), "not-a-session")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await signOut(deps(), signedIn.sessionToken);
    await expect(authenticate(deps(), signedIn.sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("account care", () => {
  it("a reset link changes the password, ends the old sessions, and still asks for the code", async () => {
    const { signedIn } = await enrolled();
    const token = (await issueResetLink(deps(), EMAIL)).split("/setup/")[1];
    await expect(readSetupLink(deps(), token)).resolves.toMatchObject({ purpose: "reset" });
    expectStep(await completeSetupLink(deps(), { token, password: "A brand new secret 9", remember: false }, browser()), "code-required");
    await expect(authenticate(deps(), signedIn.sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expectStep(await signIn(deps(), { email: EMAIL, password: "A brand new secret 9", remember: false }, browser()), "code-required");
  });

  it("resetting the codes asks to set them up again and forgets remembered devices", async () => {
    const { secret } = await enrolled();
    const step = expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: true }, browser()), "code-required");
    const { deviceToken, sessionToken } = await verifyCode(deps(), { challengeToken: step.challengeToken, code: totpCode(secret, clock) }, browser());
    await resetTwoStep(deps(), EMAIL);
    await expect(authenticate(deps(), sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expectStep(await signIn(deps(), { email: EMAIL, password: PASSWORD, remember: true }, browser(deviceToken)), "setup-required");
  });

  it("a disabled account can't sign in, and its sessions end", async () => {
    const { signedIn } = await enrolled();
    await disableStaff(deps(), EMAIL);
    await expect(authenticate(deps(), signedIn.sessionToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(signIn(deps(), { email: EMAIL, password: PASSWORD, remember: false }, browser())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(issueResetLink(deps(), "nobody@example.com")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
