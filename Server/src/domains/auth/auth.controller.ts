import type { Request, Response } from "express";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import {
  CHALLENGE_COOKIE,
  DEVICE_COOKIE,
  GOOGLE_COOKIE,
  GOOGLE_NONCE_COOKIE,
  SESSION_COOKIE,
  clearAuthCookie,
  readCookie,
  setChallengeCookie,
  setDeviceCookie,
  setGoogleCookie,
  setGoogleNonceCookie,
  setSessionCookie,
} from "./auth.cookies.js";
import { authDeps } from "./auth.middleware.js";
import {
  finishGoogleButton,
  finishGoogleSignIn,
  pendingCode,
  resendCode,
  signOut,
  startGoogleButton,
  startGoogleSignIn,
  verifyCode,
  type DeviceContext,
  type SignedInOutcome,
} from "./auth.service.js";
import { GoogleCallbackQuerySchema, GoogleStartQuerySchema, type GoogleCredentialBody, type VerifyCodeBody } from "./auth.validator.js";

function deviceOf(req: Pick<Request, "cookies" | "ip" | "get">): DeviceContext {
  return { deviceToken: readCookie(req, DEVICE_COOKIE), ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

function setSignedInCookies(res: Response, outcome: SignedInOutcome): void {
  setSessionCookie(res, outcome.sessionToken, outcome.remember);
  setDeviceCookie(res, outcome.deviceToken);
  clearAuthCookie(res, CHALLENGE_COOKIE);
}

/** "Continue with Google": a browser navigation, answered with a redirect to Google. */
export function getGoogle(req: Request, res: Response): void {
  const query = GoogleStartQuerySchema.parse(req.query);
  const { redirectUrl, googleStep } = startGoogleSignIn(authDeps(res), query);
  setGoogleCookie(res, googleStep);
  res.redirect(302, redirectUrl);
}

/** How a failed callback is told to the dashboard's sign-in screen (?error=). */
const CALLBACK_ERRORS: Record<string, string> = {
  GOOGLE_CANCELLED: "cancelled",
  NOT_REGISTERED: "not-registered",
  TOO_MANY_ATTEMPTS: "too-many-attempts",
  EMAIL_FAILED: "email-failed",
};

/** Google sends the browser back here. Always answers with a redirect to the dashboard, never with JSON. */
export async function getGoogleCallback(req: Request, res: Response): Promise<void> {
  const deps = authDeps(res);
  const dashboard = deps.dashboardUrl.replace(/\/+$/, "");
  const googleStep = readCookie(req, GOOGLE_COOKIE);
  clearAuthCookie(res, GOOGLE_COOKIE);
  try {
    const query = GoogleCallbackQuerySchema.parse(req.query);
    const outcome = await finishGoogleSignIn(
      deps,
      { googleStep, state: query.state ?? null, code: query.code ?? null, error: query.error ?? null },
      deviceOf(req),
    );
    if (outcome.step === "signed-in") {
      setSignedInCookies(res, outcome);
      res.redirect(302, `${dashboard}${outcome.returnTo}`);
    } else {
      setChallengeCookie(res, outcome.challengeToken);
      res.redirect(302, `${dashboard}/login?step=code`);
    }
  } catch (err) {
    const known = err instanceof AppError ? CALLBACK_ERRORS[err.code ?? ""] : undefined;
    if (!known) logger.warn({ err, requestId: req.id }, "Google sign-in failed");
    res.redirect(302, `${dashboard}/login?error=${known ?? "google-failed"}`);
  }
}

/** Before Google's button is shown: the nonce it carries, and its sealed copy in a cookie. */
export function getGoogleNonce(_req: Request, res: Response): void {
  const { nonce, googleNonce } = startGoogleButton(authDeps(res));
  setGoogleNonceCookie(res, googleNonce);
  res.json({ status: "ok", nonce });
}

/** The ID token from Google's button: signed in, or the emailed code is next. */
export async function postGoogleCredential(req: Request<unknown, unknown, GoogleCredentialBody>, res: Response): Promise<void> {
  const outcome = await finishGoogleButton(
    authDeps(res),
    { googleNonce: readCookie(req, GOOGLE_NONCE_COOKIE), ...req.body },
    deviceOf(req),
  );
  clearAuthCookie(res, GOOGLE_NONCE_COOKIE);
  if (outcome.step === "signed-in") {
    setSignedInCookies(res, outcome);
    res.json({ status: "ok", step: "signed-in", ...outcome.signedIn, returnTo: outcome.returnTo });
    return;
  }
  setChallengeCookie(res, outcome.challengeToken);
  res.json({ status: "ok", step: "code-required" });
}

/** Where the waiting code was sent, partly hidden. */
export async function getCode(req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", ...(await pendingCode(authDeps(res), readCookie(req, CHALLENGE_COOKIE))) });
}

export async function postResendCode(req: Request, res: Response): Promise<void> {
  await resendCode(authDeps(res), readCookie(req, CHALLENGE_COOKIE));
  res.json({ status: "ok" });
}

export async function postVerifyCode(req: Request<unknown, unknown, VerifyCodeBody>, res: Response): Promise<void> {
  const outcome = await verifyCode(authDeps(res), { challengeToken: readCookie(req, CHALLENGE_COOKIE), code: req.body.code }, deviceOf(req));
  setSignedInCookies(res, outcome);
  res.json({ status: "ok", step: "signed-in", ...outcome.signedIn, returnTo: outcome.returnTo });
}

/** requireStaff has already checked the session. */
export function getSession(req: Request, res: Response): void {
  res.json({ status: "ok", ...req.staff });
}

export async function postSignOut(req: Request, res: Response): Promise<void> {
  await signOut(authDeps(res), readCookie(req, SESSION_COOKIE));
  clearAuthCookie(res, SESSION_COOKIE);
  res.json({ status: "ok" });
}
