import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, URL-safe: session, device, sign-in step and setup-link tokens. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database keeps instead of a token, so a dump or backup holds no live credential. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
