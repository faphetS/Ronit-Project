import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Staff passwords, stored only as scrypt hashes in the form "scrypt$N$r$p$salt$hash". The cost
 * travels with each hash, so it can go up later and older hashes still check. scrypt is part
 * of Node's own crypto, so the Docker image needs no native package for it.
 */

interface Cost {
  N: number;
  r: number;
  p: number;
}

/** OWASP's scrypt setting for 32 MiB of memory. */
const COST: Cost = { N: 2 ** 15, r: 8, p: 3 };
const KEY_BYTES = 32;
const SALT_BYTES = 16;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** A password's length as people count it: "שלום" is 4, whatever its bytes. */
export function passwordLength(password: string): number {
  return [...password].length;
}

function derive(password: string, salt: Buffer, cost: Cost, bytes: number): Promise<Buffer> {
  // OpenSSL needs about 128·r·(N + p + 2) bytes; Node refuses anything over 32 MiB unless told.
  const maxmem = 128 * cost.r * (cost.N + cost.p + 2) + 1024 * 1024;
  return new Promise((resolve, reject) => {
    // NFC, so the same letters typed on another keyboard give the same password.
    scrypt(password.normalize("NFC"), salt, bytes, { ...cost, maxmem }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, COST, KEY_BYTES);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Reads the cost from the stored hash, within limits a hash of ours never goes past. */
function parse(stored: string): { cost: Cost; salt: Buffer; key: Buffer } | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const powerOfTwo = Number.isInteger(N) && N >= 2 && N <= 2 ** 17 && (N & (N - 1)) === 0;
  // At most 128 MiB for one check.
  if (!powerOfTwo || !Number.isInteger(r) || r < 1 || r > 8 || !Number.isInteger(p) || p < 1 || p > 8) return null;
  const salt = Buffer.from(parts[4], "base64url");
  const key = Buffer.from(parts[5], "base64url");
  if (salt.length < SALT_BYTES || key.length < KEY_BYTES) return null;
  return { cost: { N, r, p }, salt, key };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const hash = parse(stored);
  if (!hash) return false;
  const key = await derive(password, hash.salt, hash.cost, hash.key.length);
  return timingSafeEqual(key, hash.key);
}

let dummy: Promise<string> | null = null;

/**
 * For a username nobody has, or an account without a password: the same work as a real
 * check, so the answer takes about as long and doesn't tell which usernames exist.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(16).toString("base64url"));
  await verifyPassword(password, await dummy);
}
