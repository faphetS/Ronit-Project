import type { Request, Response } from "express";
import {
  CHALLENGE_COOKIE,
  DEVICE_COOKIE,
  SESSION_COOKIE,
  clearAuthCookie,
  readCookie,
  setChallengeCookie,
  setDeviceCookie,
  setSessionCookie,
} from "./auth.cookies.js";
import { authDeps } from "./auth.middleware.js";
import {
  completeSetupLink,
  readSetupLink,
  signIn,
  signOut,
  verifyCode,
  type DeviceContext,
  type SignInOutcome,
} from "./auth.service.js";
import type { CompleteSetupLinkBody, SetupLinkParams, SignInBody, VerifyCodeBody } from "./auth.validator.js";

function deviceOf(req: Pick<Request, "cookies" | "ip" | "get">): DeviceContext {
  return { deviceToken: readCookie(req, DEVICE_COOKIE), ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

/** Tokens go into cookies; the body says what comes next. */
function sendOutcome(res: Response, outcome: SignInOutcome): void {
  if (outcome.step === "signed-in") {
    setSessionCookie(res, outcome.sessionToken, outcome.remember);
    setDeviceCookie(res, outcome.deviceToken);
    clearAuthCookie(res, CHALLENGE_COOKIE);
    res.json({ status: "ok", step: "signed-in", ...outcome.signedIn });
    return;
  }
  setChallengeCookie(res, outcome.challengeToken);
  res.json(outcome.step === "setup-required" ? { status: "ok", step: outcome.step, setup: outcome.setup } : { status: "ok", step: outcome.step });
}

export async function postSignIn(req: Request<unknown, unknown, SignInBody>, res: Response): Promise<void> {
  sendOutcome(res, await signIn(authDeps(res), req.body, deviceOf(req)));
}

export async function postVerifyCode(req: Request<unknown, unknown, VerifyCodeBody>, res: Response): Promise<void> {
  const challengeToken = readCookie(req, CHALLENGE_COOKIE);
  sendOutcome(res, await verifyCode(authDeps(res), { challengeToken, code: req.body.code }, deviceOf(req)));
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

export async function getSetupLink(req: Request<SetupLinkParams>, res: Response): Promise<void> {
  res.json({ status: "ok", link: await readSetupLink(authDeps(res), req.params.token) });
}

export async function postSetupLink(req: Request<SetupLinkParams, unknown, CompleteSetupLinkBody>, res: Response): Promise<void> {
  sendOutcome(res, await completeSetupLink(authDeps(res), { token: req.params.token, ...req.body }, deviceOf(req)));
}
