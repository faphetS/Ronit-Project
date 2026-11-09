import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Db, Queryable } from "../../config/pg.js";
import { AppError } from "../../lib/errors.js";
import { pkceChallenge, type GoogleIdentity, type GoogleSignIn } from "../../lib/google-oidc.js";
import type { Mailer } from "../../lib/mailer.js";
import { burnPasswordCheck, verifyPassword } from "../../lib/passwords.js";
import { openSecret, sealSecret } from "../../lib/secret-box.js";
import { hashToken, newToken } from "../../lib/tokens.js";
import { signInCodeEmail } from "./auth.emails.js";

/**
 * Staff sign-in for the dashboard: a username (or email) and password, or "Continue with
 * Google" for a registered email; then a 6-digit code by email on a device that isn't
 * remembered, then a server-side session. The HTTP layer (auth.controller.ts) turns the tokens
 * returned here into HttpOnly cookies; nothing here knows about HTTP.
 * Design: docs/superpowers/specs/2026-11-02-staff-sign-in-design.md and
 * docs/superpowers/specs/2026-11-09-password-sign-in-design.md
 */

export type Role = "admin" | "office" | "sales";

/** The shapes the dashboard's `StaffUser`, `Session` and `SignedIn` types expect. */
export interface StaffUserDto {
  id: string;
  name: string;
  initial: string;
  role: Role;
  passportAccess: boolean;
}

export interface SessionDto {
  userId: string;
  signedInAt: string;
}

export interface SignedInDto {
  session: SessionDto;
  user: StaffUserDto;
}

export interface AuthDeps {
  db: Db;
  /** AUTH_SECRET: seals the cookie that carries the Google step, and keys the emailed codes. */
  secretKey: Buffer;
  /** DASHBOARD_URL: where sign-in lands. */
  dashboardUrl: string;
  google: GoogleSignIn;
  mailer: Mailer;
  now: () => Date;
}

/** What the request brings besides its body. */
export interface DeviceContext {
  /** The browser's device cookie, if it has one. */
  deviceToken: string | null;
  ip: string | null;
  userAgent: string | null;
}

export type SignedInOutcome = {
  step: "signed-in";
  signedIn: SignedInDto;
  sessionToken: string;
  remember: boolean;
  deviceToken: string;
  /** The dashboard page to land on. */
  returnTo: string;
};

/** After Google or a password: signed in, or the emailed code is next. */
export type SignInOutcome = SignedInOutcome | { step: "code-sent"; challengeToken: string; returnTo: string };

export const SESSION_HOURS = 12;
export const REMEMBERED_SESSION_DAYS = 30;
export const TRUSTED_DEVICE_DAYS = 30;
/** The round trip to Google and back. */
export const GOOGLE_STEP_MINUTES = 10;
export const CODE_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_MAX_SENDS = 3;
export const RESEND_AFTER_SECONDS = 60;
export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_MINUTES = 15;
/** last_seen_at is written at most once a minute, not on every request. */
const LAST_SEEN_RESOLUTION_MS = 60_000;
const GOOGLE_STEP_CONTEXT = "google-sign-in";

const minutesAfter = (at: Date, minutes: number) => new Date(at.getTime() + minutes * 60_000);

export const tooManyAttempts = () => new AppError(429, "Too many attempts — try again in 15 minutes", "TOO_MANY_ATTEMPTS");
const googleFailed = (why: string) => new AppError(400, `Google sign-in didn't complete: ${why}`, "GOOGLE_FAILED");
const googleCancelled = () => new AppError(400, "Google sign-in was cancelled", "GOOGLE_CANCELLED");
const notRegistered = () => new AppError(403, "This Google account isn't registered", "NOT_REGISTERED");
/** One answer for an unknown username, an account without a password and a wrong password. */
const invalidLogin = () => new AppError(401, "Wrong username or password", "INVALID_LOGIN");
const invalidCode = () => new AppError(401, "Wrong code", "INVALID_CODE");
const challengeExpired = () => new AppError(401, "This sign-in step expired — sign in again", "CHALLENGE_EXPIRED");
const resendTooSoon = () => new AppError(429, "A new code can be sent a minute after the last one", "RESEND_TOO_SOON");
const unauthenticated = () => new AppError(401, "Not signed in", "UNAUTHENTICATED");
const sessionExpired = () => new AppError(401, "The session ended — sign in again", "SESSION_EXPIRED");

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f);
}

/** Where to land after signing in: a path inside the dashboard, never another site. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 300) return "/";
  // Browsers drop tabs and newlines from URLs, so "/\t/evil.example" would become "//evil.example".
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value) || hasControlCharacter(value)) return "/";
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/login/")) return "/";
  return value;
}

/** r***@gmail.com: enough to recognize the mailbox on the code screen. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 1 ? "***" : `${email[0]}***${email.slice(at)}`;
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  passport_access: boolean;
  google_sub: string | null;
  locked_until: Date | null;
  disabled_at: Date | null;
}

const USER_COLUMNS = "id, email, name, role, passport_access, google_sub, locked_until, disabled_at";

async function findUser(q: Queryable, where: "email" | "id" | "google_sub", value: string): Promise<UserRow | null> {
  const { rows } = await q.query<UserRow>(`SELECT ${USER_COLUMNS} FROM staff_users WHERE ${where} = $1`, [value]);
  return rows[0] ?? null;
}

function toUserDto(user: Pick<UserRow, "id" | "name" | "role" | "passport_access">): StaffUserDto {
  return {
    id: user.id,
    name: user.name,
    initial: Array.from(user.name.trim())[0] ?? "?",
    role: user.role,
    passportAccess: user.passport_access,
  };
}

/** One line in the access log. Details go through text, which node-postgres and PGlite pass alike. */
export async function recordAudit(
  q: Queryable,
  at: Date,
  action: string,
  byUserId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await q.query("INSERT INTO audit_log (at, by_user_id, action, details) VALUES ($1, $2, $3, $4::text::jsonb)", [
    at,
    byUserId,
    action,
    JSON.stringify(details),
  ]);
}

/** Counts a wrong code; the fifth in a row locks the account for 15 minutes. */
async function recordFailure(deps: AuthDeps, userId: string, now: Date): Promise<"counted" | "locked"> {
  const { rows } = await deps.db.query<{ failed_sign_ins: number }>(
    `UPDATE staff_users
     SET failed_sign_ins = CASE WHEN failed_sign_ins + 1 >= $2 THEN 0 ELSE failed_sign_ins + 1 END,
         locked_until = CASE WHEN failed_sign_ins + 1 >= $2 THEN $3 ELSE locked_until END
     WHERE id = $1
     RETURNING failed_sign_ins`,
    [userId, MAX_FAILED_SIGN_INS, minutesAfter(now, LOCK_MINUTES)],
  );
  // The counter only drops back to 0 here when the account was just locked.
  if (rows[0]?.failed_sign_ins !== 0) return "counted";
  await recordAudit(deps.db, now, "sign-in-locked", userId);
  return "locked";
}

const isLocked = (user: UserRow, now: Date) => user.locked_until !== null && user.locked_until > now;

interface GoogleStep {
  state: string;
  nonce: string;
  verifier: string;
  remember: boolean;
  returnTo: string;
  startedAt: number;
}

/**
 * The first leg: where to send the browser, and the sealed value for the cookie that has to
 * come back with Google's answer (state, nonce and PKCE verifier, so nobody else's answer fits).
 */
export function startGoogleSignIn(
  deps: Pick<AuthDeps, "secretKey" | "google" | "now">,
  input: { remember: boolean; returnTo: string },
): { redirectUrl: string; googleStep: string } {
  const step: GoogleStep = {
    state: newToken(),
    nonce: newToken(),
    verifier: newToken(),
    remember: input.remember,
    returnTo: safeReturnTo(input.returnTo),
    startedAt: deps.now().getTime(),
  };
  return {
    redirectUrl: deps.google.authorizeUrl({ state: step.state, nonce: step.nonce, codeChallenge: pkceChallenge(step.verifier) }),
    googleStep: sealSecret(Buffer.from(JSON.stringify(step)), deps.secretKey, GOOGLE_STEP_CONTEXT),
  };
}

function openGoogleStep(deps: AuthDeps, sealed: string | null, now: Date): GoogleStep {
  if (!sealed) throw googleFailed("no sign-in in progress on this browser");
  let step: GoogleStep;
  try {
    step = JSON.parse(openSecret(sealed, deps.secretKey, GOOGLE_STEP_CONTEXT).toString("utf8")) as GoogleStep;
  } catch {
    throw googleFailed("unreadable sign-in step");
  }
  if (now.getTime() - step.startedAt > GOOGLE_STEP_MINUTES * 60_000) throw googleFailed("the Google step took too long");
  return step;
}

/**
 * The staff member behind a Google identity. The first sign-in binds the Google account to the
 * registered email; after that only that account gets in, even if someone else later gets a
 * Google account under the same address.
 */
async function registeredUser(deps: AuthDeps, identity: GoogleIdentity, now: Date): Promise<UserRow> {
  const bound = await findUser(deps.db, "google_sub", identity.sub);
  if (bound && !bound.disabled_at) return bound;
  const byEmail = bound ? null : await findUser(deps.db, "email", identity.email);
  if (!byEmail || byEmail.disabled_at || byEmail.google_sub) {
    await recordAudit(deps.db, now, "sign-in-refused", bound?.id ?? byEmail?.id ?? null, { email: identity.email });
    throw notRegistered();
  }
  await deps.db.query("UPDATE staff_users SET google_sub = $2, updated_at = $3 WHERE id = $1 AND google_sub IS NULL", [
    byEmail.id,
    identity.sub,
    now,
  ]);
  return { ...byEmail, google_sub: identity.sub };
}

async function isTrustedDevice(q: Queryable, deviceToken: string, userId: string, now: Date): Promise<boolean> {
  const { rows } = await q.query(
    "SELECT 1 FROM staff_devices WHERE token_hash = $1 AND user_id = $2 AND trusted_until > $3",
    [hashToken(deviceToken), userId, now],
  );
  return rows.length > 0;
}

/** Google's answer: who it is, whether they're registered, and whether a code is needed. */
export async function finishGoogleSignIn(
  deps: AuthDeps,
  input: { googleStep: string | null; state: string | null; code: string | null; error: string | null },
  device: DeviceContext,
): Promise<SignInOutcome> {
  const now = deps.now();
  if (input.error === "access_denied") throw googleCancelled();
  const step = openGoogleStep(deps, input.googleStep, now);
  if (input.error) throw googleFailed(input.error);
  if (!input.state || !sameText(input.state, step.state)) throw googleFailed("state mismatch");
  if (!input.code) throw googleFailed("no code from Google");
  const identity = await deps.google.exchange({ code: input.code, codeVerifier: step.verifier, nonce: step.nonce });
  return continueAfterGoogle(deps, identity, { remember: step.remember, returnTo: step.returnTo }, device, now);
}

/** Whichever way Google answered: is the person registered, and is a code needed? */
async function continueAfterGoogle(
  deps: AuthDeps,
  identity: GoogleIdentity,
  options: { remember: boolean; returnTo: string },
  device: DeviceContext,
  now: Date,
): Promise<SignInOutcome> {
  return continueSignIn(deps, await registeredUser(deps, identity, now), options, device, now);
}

/**
 * After Google or a password: a session straight away on a remembered device (or with the
 * two-step switch off), otherwise the emailed code first.
 */
async function continueSignIn(
  deps: AuthDeps,
  user: UserRow,
  options: { remember: boolean; returnTo: string },
  device: DeviceContext,
  now: Date,
): Promise<SignInOutcome> {
  const { remember, returnTo } = options;
  if (isLocked(user, now)) throw tooManyAttempts();

  const { rows } = await deps.db.query<{ two_step_required: boolean }>("SELECT two_step_required FROM security_settings");
  const twoStep = rows[0]?.two_step_required ?? true;
  const trusted = twoStep && device.deviceToken !== null && (await isTrustedDevice(deps.db, device.deviceToken, user.id, now));
  if (!twoStep || trusted) {
    return deps.db.transaction((tx) => startSession(tx, user, { remember, trust: twoStep && remember, device, returnTo }, now));
  }
  const challengeToken = await sendFirstCode(deps, user, { remember, returnTo }, now);
  return { step: "code-sent", challengeToken, returnTo };
}

const GOOGLE_BUTTON_CONTEXT = "google-button";
/** How long Google's button stays usable after the sign-in screen asked for its nonce. */
export const GOOGLE_BUTTON_MINUTES = 30;

/**
 * Google's own button needs a nonce before it's clicked: Google puts it in the ID token, and
 * the sealed cookie returned with it proves the token was asked for on this browser, now.
 */
export function startGoogleButton(deps: Pick<AuthDeps, "secretKey" | "now">): { nonce: string; googleNonce: string } {
  const nonce = newToken();
  const sealed = sealSecret(Buffer.from(JSON.stringify({ nonce, startedAt: deps.now().getTime() })), deps.secretKey, GOOGLE_BUTTON_CONTEXT);
  return { nonce, googleNonce: sealed };
}

/** The ID token Google's button handed the dashboard. */
export async function finishGoogleButton(
  deps: AuthDeps,
  input: { googleNonce: string | null; credential: string; remember: boolean; returnTo: string },
  device: DeviceContext,
): Promise<SignInOutcome> {
  const now = deps.now();
  if (!input.googleNonce) throw googleFailed("no sign-in in progress on this browser");
  let step: { nonce: string; startedAt: number };
  try {
    step = JSON.parse(openSecret(input.googleNonce, deps.secretKey, GOOGLE_BUTTON_CONTEXT).toString("utf8")) as { nonce: string; startedAt: number };
  } catch {
    throw googleFailed("unreadable sign-in step");
  }
  if (now.getTime() - step.startedAt > GOOGLE_BUTTON_MINUTES * 60_000) throw googleFailed("the sign-in screen was open too long");
  const identity = await deps.google.verifyCredential({ credential: input.credential, nonce: step.nonce });
  return continueAfterGoogle(deps, identity, { remember: input.remember, returnTo: safeReturnTo(input.returnTo) }, device, now);
}

// ---- Username (or email) and password ----

type PasswordUserRow = UserRow & { password_hash: string | null };

/** A login with "@" is an email; anything else is a username. Both are stored in lower case. */
async function findByLogin(q: Queryable, login: string): Promise<PasswordUserRow | null> {
  const value = login.trim().toLowerCase();
  const column = value.includes("@") ? "email" : "username";
  const { rows } = await q.query<PasswordUserRow>(`SELECT ${USER_COLUMNS}, password_hash FROM staff_users WHERE ${column} = $1`, [value]);
  return rows[0] ?? null;
}

/**
 * Checks a password as one try. The try is claimed before the check, so parallel guesses
 * can't go past five; the fifth wrong one in a row locks password sign-in for 15 minutes,
 * and while it's locked no try is checked at all. The lock has its own count, so Google still
 * gets the person in. A right password starts the count again.
 */
export async function tryPassword(q: Queryable, userId: string, passwordHash: string, password: string, now: Date): Promise<boolean> {
  const { rows } = await q.query<{ password_failures: number }>(
    `UPDATE staff_users
     SET password_failures = CASE WHEN password_failures + 1 >= $2 THEN 0 ELSE password_failures + 1 END,
         password_locked_until = CASE WHEN password_failures + 1 >= $2 THEN $3 ELSE password_locked_until END
     WHERE id = $1 AND (password_locked_until IS NULL OR password_locked_until <= $4)
     RETURNING password_failures`,
    [userId, MAX_FAILED_SIGN_INS, minutesAfter(now, LOCK_MINUTES), now],
  );
  if (!rows[0]) throw tooManyAttempts();
  if (await verifyPassword(password, passwordHash)) {
    await q.query("UPDATE staff_users SET password_failures = 0, password_locked_until = NULL WHERE id = $1", [userId]);
    return true;
  }
  // The count only drops back to 0 on the try that set the lock.
  if (rows[0].password_failures === 0) {
    await recordAudit(q, now, "password-locked", userId);
    throw tooManyAttempts();
  }
  return false;
}

/** The username (or email) and password: then, as after Google, a session or the emailed code. */
export async function signInWithPassword(
  deps: AuthDeps,
  input: { login: string; password: string; remember: boolean; returnTo: string },
  device: DeviceContext,
): Promise<SignInOutcome> {
  const now = deps.now();
  const user = await findByLogin(deps.db, input.login);
  if (!user || user.disabled_at || !user.password_hash) {
    await burnPasswordCheck(input.password);
    throw invalidLogin();
  }
  if (isLocked(user, now)) throw tooManyAttempts();
  if (!(await tryPassword(deps.db, user.id, user.password_hash, input.password, now))) throw invalidLogin();
  return continueSignIn(deps, user, { remember: input.remember, returnTo: safeReturnTo(input.returnTo) }, device, now);
}

function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Keyed with AUTH_SECRET: a stolen database can't turn a stored hash back into the code. */
function codeHash(secretKey: Buffer, challengeTokenHash: string, code: string): string {
  return createHmac("sha256", secretKey).update(`${challengeTokenHash}:${code}`).digest("hex");
}

async function sendFirstCode(deps: AuthDeps, user: UserRow, options: { remember: boolean; returnTo: string }, now: Date): Promise<string> {
  const challengeToken = newToken();
  const tokenHash = hashToken(challengeToken);
  const code = newCode();
  await deps.db.query(
    `INSERT INTO staff_sign_in_challenges (user_id, token_hash, code_hash, remember, return_to, last_sent_at, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
    [user.id, tokenHash, codeHash(deps.secretKey, tokenHash, code), options.remember, options.returnTo, now, minutesAfter(now, CODE_MINUTES)],
  );
  try {
    await deps.mailer.send({ to: user.email, ...signInCodeEmail({ name: user.name, code }) });
  } catch (err) {
    // Nobody has this code; don't leave a step that can only fail.
    await deps.db.query("DELETE FROM staff_sign_in_challenges WHERE token_hash = $1", [tokenHash]);
    throw err;
  }
  return challengeToken;
}

/** Where the waiting code went, partly hidden, while it can still be used. */
export async function pendingCode(deps: AuthDeps, challengeToken: string | null): Promise<{ email: string }> {
  if (!challengeToken) throw challengeExpired();
  const { rows } = await deps.db.query<{ email: string }>(
    `SELECT u.email FROM staff_sign_in_challenges c JOIN staff_users u ON u.id = c.user_id
     WHERE c.token_hash = $1 AND c.used_at IS NULL AND c.expires_at > $2 AND c.attempts < $3`,
    [hashToken(challengeToken), deps.now(), CODE_MAX_ATTEMPTS],
  );
  if (!rows[0]) throw challengeExpired();
  return { email: maskEmail(rows[0].email) };
}

/** A new code for the same step: a minute after the last one, three codes at most. The old code stops working. */
export async function resendCode(deps: AuthDeps, challengeToken: string | null): Promise<void> {
  if (!challengeToken) throw challengeExpired();
  const now = deps.now();
  const tokenHash = hashToken(challengeToken);
  const { rows } = await deps.db.query<{ user_id: string; sends: number; last_sent_at: Date }>(
    "SELECT user_id, sends, last_sent_at FROM staff_sign_in_challenges WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2",
    [tokenHash, now],
  );
  const challenge = rows[0];
  if (!challenge || challenge.sends >= CODE_MAX_SENDS) throw challengeExpired();
  if (now.getTime() - challenge.last_sent_at.getTime() < RESEND_AFTER_SECONDS * 1000) throw resendTooSoon();
  const user = await findUser(deps.db, "id", challenge.user_id);
  if (!user || user.disabled_at) throw challengeExpired();
  if (isLocked(user, now)) throw tooManyAttempts();

  const code = newCode();
  const updated = await deps.db.query(
    `UPDATE staff_sign_in_challenges
     SET code_hash = $2, attempts = 0, sends = sends + 1, last_sent_at = $3, expires_at = $4
     WHERE token_hash = $1 AND used_at IS NULL AND sends = $5
     RETURNING id`,
    [tokenHash, codeHash(deps.secretKey, tokenHash, code), now, minutesAfter(now, CODE_MINUTES), challenge.sends],
  );
  if (updated.rows.length === 0) throw resendTooSoon(); // another resend got there first
  await deps.mailer.send({ to: user.email, ...signInCodeEmail({ name: user.name, code }) });
}

interface ChallengeRow {
  id: string;
  user_id: string;
  code_hash: string;
  remember: boolean;
  return_to: string;
}

/** The 6-digit code from the email. */
export async function verifyCode(
  deps: AuthDeps,
  input: { challengeToken: string | null; code: string },
  device: DeviceContext,
): Promise<SignedInOutcome> {
  const now = deps.now();
  if (!input.challengeToken) throw challengeExpired();
  const tokenHash = hashToken(input.challengeToken);
  // Claim a try before checking the code, so parallel guesses can't go past the limit.
  const { rows } = await deps.db.query<ChallengeRow>(
    `UPDATE staff_sign_in_challenges SET attempts = attempts + 1
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 AND attempts < $3
     RETURNING id, user_id, code_hash, remember, return_to`,
    [tokenHash, now, CODE_MAX_ATTEMPTS],
  );
  const challenge = rows[0];
  if (!challenge) throw challengeExpired();
  const user = await findUser(deps.db, "id", challenge.user_id);
  if (!user || user.disabled_at) throw challengeExpired();
  if (isLocked(user, now)) throw tooManyAttempts();
  if (!sameText(codeHash(deps.secretKey, tokenHash, input.code), challenge.code_hash)) {
    throw (await recordFailure(deps, user.id, now)) === "locked" ? tooManyAttempts() : invalidCode();
  }

  return deps.db.transaction(async (tx) => {
    const used = await tx.query("UPDATE staff_sign_in_challenges SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id", [
      challenge.id,
      now,
    ]);
    if (used.rows.length === 0) throw challengeExpired();
    return startSession(tx, user, { remember: challenge.remember, trust: challenge.remember, device, returnTo: challenge.return_to }, now);
  });
}

/**
 * Opens a session, and records the browser: a browser this person never signed in from is a
 * "new device" in the access log. `trust` keeps the device remembered (no code) for 30 days;
 * without it the device is forgotten, so unticking "remember me" takes effect.
 */
async function startSession(
  tx: Queryable,
  user: UserRow,
  options: { remember: boolean; trust: boolean; device: DeviceContext; returnTo: string },
  now: Date,
): Promise<SignedInOutcome> {
  const { remember, trust, device, returnTo } = options;
  const userAgent = device.userAgent?.slice(0, 300) ?? null;
  const sessionToken = newToken();
  const expiresAt = remember ? minutesAfter(now, REMEMBERED_SESSION_DAYS * 24 * 60) : minutesAfter(now, SESSION_HOURS * 60);
  await tx.query(
    `INSERT INTO staff_sessions (user_id, token_hash, remember, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7)`,
    [user.id, hashToken(sessionToken), remember, now, expiresAt, device.ip, userAgent],
  );

  const deviceToken = device.deviceToken ?? newToken();
  const trustedUntil = trust ? minutesAfter(now, TRUSTED_DEVICE_DAYS * 24 * 60) : null;
  const { rows } = await tx.query<{ inserted: boolean }>(
    `INSERT INTO staff_devices (token_hash, user_id, first_seen_at, last_seen_at, trusted_until, user_agent)
     VALUES ($1, $2, $3, $3, $4, $5)
     ON CONFLICT (token_hash, user_id) DO UPDATE SET last_seen_at = $3, trusted_until = $4, user_agent = $5
     RETURNING (xmax = 0) AS inserted`,
    [hashToken(deviceToken), user.id, now, trustedUntil, userAgent],
  );
  if (rows[0]?.inserted) await recordAudit(tx, now, "new-device-sign-in", user.id, { userAgent });

  await tx.query("UPDATE staff_users SET last_sign_in_at = $2, failed_sign_ins = 0, locked_until = NULL WHERE id = $1", [
    user.id,
    now,
  ]);
  return {
    step: "signed-in",
    signedIn: { session: { userId: user.id, signedInAt: now.toISOString() }, user: toUserDto(user) },
    sessionToken,
    remember,
    deviceToken,
    returnTo,
  };
}

interface SessionRow {
  id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  user_id: string;
  name: string;
  role: Role;
  passport_access: boolean;
  disabled_at: Date | null;
  auto_sign_out: boolean;
  auto_sign_out_minutes: number;
}

/**
 * The signed-in person behind a session cookie. Ends the session when it ran past its
 * lifetime, or sat unused longer than the automatic sign-out allows; every call counts as
 * activity.
 */
export async function authenticate(deps: Pick<AuthDeps, "db" | "now">, sessionToken: string | null): Promise<SignedInDto> {
  if (!sessionToken) throw unauthenticated();
  const now = deps.now();
  const { rows } = await deps.db.query<SessionRow>(
    `SELECT s.id, s.created_at, s.last_seen_at, s.expires_at, s.ended_at,
            u.id AS user_id, u.name, u.role, u.passport_access, u.disabled_at,
            sec.auto_sign_out, sec.auto_sign_out_minutes
     FROM staff_sessions s
     JOIN staff_users u ON u.id = s.user_id
     CROSS JOIN security_settings sec
     WHERE s.token_hash = $1`,
    [hashToken(sessionToken)],
  );
  const row = rows[0];
  if (!row || row.ended_at || row.disabled_at) throw unauthenticated();
  const idleUntil = row.auto_sign_out ? minutesAfter(row.last_seen_at, row.auto_sign_out_minutes) : null;
  if (row.expires_at <= now || (idleUntil && idleUntil <= now)) {
    await deps.db.query("UPDATE staff_sessions SET ended_at = $2 WHERE id = $1 AND ended_at IS NULL", [row.id, now]);
    throw sessionExpired();
  }
  if (now.getTime() - row.last_seen_at.getTime() >= LAST_SEEN_RESOLUTION_MS) {
    await deps.db.query("UPDATE staff_sessions SET last_seen_at = $2 WHERE id = $1", [row.id, now]);
  }
  return {
    session: { userId: row.user_id, signedInAt: row.created_at.toISOString() },
    user: toUserDto({ id: row.user_id, name: row.name, role: row.role, passport_access: row.passport_access }),
  };
}

export async function signOut(deps: Pick<AuthDeps, "db" | "now">, sessionToken: string | null): Promise<void> {
  if (!sessionToken) return;
  await deps.db.query("UPDATE staff_sessions SET ended_at = $2 WHERE token_hash = $1 AND ended_at IS NULL", [
    hashToken(sessionToken),
    deps.now(),
  ]);
}
