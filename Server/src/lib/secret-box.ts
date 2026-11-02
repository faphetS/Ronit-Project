import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for small secrets kept in the database (authenticator keys), under a key that
 * lives in Server/.env — so a database dump or backup alone doesn't hold them. The context
 * (e.g. "totp:<user id>") is authenticated with the value, so a sealed secret copied onto
 * another row doesn't open.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, each part base64url.
 */
const VERSION = "v1";

export function keyFromHex(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("The key must be 64 hex characters (32 bytes)");
  return Buffer.from(hex, "hex");
}

export function sealSecret(plain: Buffer, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** Throws when the value was changed, or sealed under another key or context. */
export function openSecret(sealed: string, key: Buffer, context: string): Buffer {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) throw new Error("Unknown sealed secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]);
}
