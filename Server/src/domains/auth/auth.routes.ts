import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  getCode,
  getGoogle,
  getGoogleCallback,
  getGoogleNonce,
  getSession,
  postGoogleCredential,
  postPassword,
  postResendCode,
  postSignOut,
  postVerifyCode,
} from "./auth.controller.js";
import {
  authDepsFromEnv,
  requireDashboardOrigin,
  requireStaff,
  signInLimiter,
  withAuthDeps,
  type AuthDepsResolver,
} from "./auth.middleware.js";
import { GoogleCredentialSchema, PasswordSignInSchema, VerifyCodeSchema } from "./auth.validator.js";

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store");
  next();
}

/** /api/auth: staff sign-in for the dashboard. Design: docs/superpowers/specs/2026-11-02-staff-sign-in-design.md */
export function createAuthRouter(resolveDeps: AuthDepsResolver, options: { signInLimit?: number } = {}): Router {
  const router = express.Router();
  const limiter = signInLimiter(options.signInLimit);

  router.use(noStore, withAuthDeps(resolveDeps), requireDashboardOrigin);
  // The username (or email) and password.
  router.post("/password", limiter, validate({ body: PasswordSignInSchema }), postPassword);
  // Google's own button: a nonce first, then the ID token it hands back.
  router.get("/google/nonce", getGoogleNonce);
  router.post("/google/credential", limiter, validate({ body: GoogleCredentialSchema }), postGoogleCredential);
  // The fallback, as browser navigations: to Google and back.
  router.get("/google", getGoogle);
  router.get("/google/callback", getGoogleCallback);
  // The emailed code.
  router.get("/code", getCode);
  router.post("/code/resend", limiter, postResendCode);
  router.post("/verify", limiter, validate({ body: VerifyCodeSchema }), postVerifyCode);
  // The session.
  router.get("/session", requireStaff, getSession);
  router.post("/sign-out", postSignOut);
  return router;
}

export default createAuthRouter(authDepsFromEnv);
