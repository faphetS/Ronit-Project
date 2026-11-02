import type { CookieOptions, Request, Response } from "express";
import { CODE_MINUTES, GOOGLE_STEP_MINUTES, REMEMBERED_SESSION_DAYS } from "./auth.service.js";

/**
 * The sign-in cookies. HttpOnly (page scripts can't read them), Secure, and the __Host- prefix
 * pins them to the API's own host. They reach the API from the dashboard only because
 * app.ronitbarash.site and api.ronitbarash.site are the same site.
 */
export const SESSION_COOKIE = "__Host-oh_session";
export const CHALLENGE_COOKIE = "__Host-oh_challenge";
export const DEVICE_COOKIE = "__Host-oh_device";
export const GOOGLE_COOKIE = "__Host-oh_google";

const DAY_MS = 24 * 3_600_000;
const DEVICE_DAYS = 365;
const BASE: CookieOptions = { httpOnly: true, secure: true, sameSite: "strict", path: "/" };

/** Without "remember me" the cookie lasts until the browser closes. */
export function setSessionCookie(res: Response, token: string, remember: boolean): void {
  res.cookie(SESSION_COOKIE, token, remember ? { ...BASE, maxAge: REMEMBERED_SESSION_DAYS * DAY_MS } : BASE);
}

export function setChallengeCookie(res: Response, token: string): void {
  res.cookie(CHALLENGE_COOKIE, token, { ...BASE, maxAge: 3 * CODE_MINUTES * 60_000 });
}

export function setDeviceCookie(res: Response, token: string): void {
  res.cookie(DEVICE_COOKIE, token, { ...BASE, maxAge: DEVICE_DAYS * DAY_MS });
}

/** Lax, not Strict: it has to come back on Google's redirect, a navigation from another site. */
export function setGoogleCookie(res: Response, sealedStep: string): void {
  res.cookie(GOOGLE_COOKIE, sealedStep, { ...BASE, sameSite: "lax", maxAge: GOOGLE_STEP_MINUTES * 60_000 });
}

export function clearAuthCookie(res: Response, name: string): void {
  res.clearCookie(name, BASE);
}

export function readCookie(req: Pick<Request, "cookies">, name: string): string | null {
  const value: unknown = req.cookies?.[name];
  return typeof value === "string" && value !== "" ? value : null;
}
