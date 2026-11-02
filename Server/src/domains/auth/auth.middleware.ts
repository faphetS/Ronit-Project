import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { crmDatabase } from "../../db/startup.js";
import { AppError } from "../../lib/errors.js";
import { keyFromHex } from "../../lib/secret-box.js";
import { SESSION_COOKIE, clearAuthCookie, readCookie } from "./auth.cookies.js";
import { authenticate, type AuthDeps, type SignedInDto } from "./auth.service.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireStaff: who is signed in. */
      staff?: SignedInDto;
    }
  }
}

/** Sign-in on this server: answers 503 until the CRM database, AUTH_SECRET and DASHBOARD_URL are all there. */
export async function authDepsFromEnv(): Promise<AuthDeps> {
  const db = await crmDatabase();
  if (!db || !env.AUTH_SECRET || !env.DASHBOARD_URL) {
    throw new AppError(503, "Sign-in is not set up on this server", "SIGN_IN_UNAVAILABLE");
  }
  return { db, secretKey: keyFromHex(env.AUTH_SECRET), dashboardUrl: env.DASHBOARD_URL, now: () => new Date() };
}

export type AuthDepsResolver = () => Promise<AuthDeps>;

/** Resolves the sign-in dependencies once per request, into res.locals.auth. */
export function withAuthDeps(resolve: AuthDepsResolver) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    res.locals.auth = await resolve();
    next();
  };
}

export function authDeps(res: Response): AuthDeps {
  return res.locals.auth as AuthDeps;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Anything that changes state must come from the dashboard itself. SameSite=Strict alone isn't
 * enough: n8n and anything else on *.ronitbarash.site count as the same site.
 */
export function requireDashboardOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get("origin") !== new URL(authDeps(res).dashboardUrl).origin) {
    throw new AppError(403, "Requests must come from the dashboard", "ORIGIN_NOT_ALLOWED");
  }
  next();
}

/** On top of the server's general /api limit: guessing passwords and codes from one IP. */
export function signInLimiter(limit = 30) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: "error", code: "TOO_MANY_ATTEMPTS", message: "Too many sign-in attempts — try again in 15 minutes" },
  });
}

/** Lets the request through only with a live session, and sets req.staff. Needs withAuthDeps first. */
export async function requireStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    req.staff = await authenticate(authDeps(res), readCookie(req, SESSION_COOKIE));
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 401) clearAuthCookie(res, SESSION_COOKIE);
    throw err;
  }
  next();
}
