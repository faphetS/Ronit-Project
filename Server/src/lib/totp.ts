import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time codes (RFC 6238): HMAC-SHA1, 6 digits, a new code every 30 seconds —
 * what Google Authenticator and the iPhone's Passwords app produce from a scanned key.
 */
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** A new key: 20 random bytes, the size RFC 4226 recommends for SHA-1. */
export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

/** RFC 4648 base32 without padding, the form authenticator apps take keys in. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Reads base32 as people type it: any case, with spaces and padding. */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The RFC 4226 code for one counter value. */
export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** The 30-second step a moment falls in. */
export function totpStep(at: Date): number {
  return Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpCode(secret: Buffer, at: Date): string {
  return hotp(secret, totpStep(at));
}

/**
 * The step a typed code belongs to, when it is the code of the current 30 seconds or of the
 * `window` steps either side (clocks drift, and people type slowly); otherwise null. The caller
 * refuses a step it already accepted, so a code works once.
 */
export function matchTotp(secret: Buffer, code: string, at: Date, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const typed = Buffer.from(code);
  const current = totpStep(at);
  for (let step = current - window; step <= current + window; step++) {
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), typed)) return step;
  }
  return null;
}

/** The otpauth:// link a QR code carries; opening it on a phone adds the key to the app. */
export function otpauthUrl({ secret, issuer, account }: { secret: string; issuer: string; account: string }): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}
