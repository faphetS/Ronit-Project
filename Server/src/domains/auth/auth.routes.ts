import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { validate } from "../../middleware/validate.js";
import { getSession, getSetupLink, postSetupLink, postSignIn, postSignOut, postVerifyCode } from "./auth.controller.js";
import {
  authDepsFromEnv,
  requireDashboardOrigin,
  requireStaff,
  signInLimiter,
  withAuthDeps,
  type AuthDepsResolver,
} from "./auth.middleware.js";
import { CompleteSetupLinkSchema, SetupLinkParamsSchema, SignInSchema, VerifyCodeSchema } from "./auth.validator.js";

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store");
  next();
}

/** /api/auth: staff sign-in for the dashboard. Design: docs/superpowers/specs/2026-11-02-staff-sign-in-design.md */
export function createAuthRouter(resolveDeps: AuthDepsResolver, options: { signInLimit?: number } = {}): Router {
  const router = express.Router();
  const limiter = signInLimiter(options.signInLimit);

  router.use(noStore, withAuthDeps(resolveDeps), requireDashboardOrigin);
  router.get("/session", requireStaff, getSession);
  router.post("/sign-in", limiter, validate({ body: SignInSchema }), postSignIn);
  router.post("/verify", limiter, validate({ body: VerifyCodeSchema }), postVerifyCode);
  router.post("/sign-out", postSignOut);
  router.get("/setup-links/:token", validate({ params: SetupLinkParamsSchema }), getSetupLink);
  router.post("/setup-links/:token", limiter, validate({ params: SetupLinkParamsSchema, body: CompleteSetupLinkSchema }), postSetupLink);
  return router;
}

export default createAuthRouter(authDepsFromEnv);
