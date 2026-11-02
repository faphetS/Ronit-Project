import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Staff passwords, hashed with scrypt from node:crypto. N=2^15, r=8, p=3 is one of OWASP's
 * equivalent minimums for scrypt. The parameters are stored with each hash, so they can be
 * raised later without breaking existing passwords.
 */
export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

const COST: ScryptCost = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
// scrypt needs about 128 * N * r bytes (32 MiB here), a little more than Node's default cap.
const MAX_MEMORY = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  const options: ScryptOptions = { ...cost, maxmem: MAX_MEMORY };
  return new Promise((resolve, reject) => {
    // NFC: the same letters typed on two devices can arrive as different code points.
    scrypt(password.normalize("NFC"), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `cost` is for tests only; real passwords always use the default. */
export async function hashPassword(password: string, cost: ScryptCost = COST): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, cost);
  return ["scrypt", cost.N, cost.r, cost.p, salt.toString("base64"), key.toString("base64")].join("$");
}

/** False for a wrong password, and for a stored value this code can't read. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Hashed once, lazily: an unknown email is checked against it so that it takes as long to
// answer as a known one, and response times don't reveal which emails have accounts.
let dummyHash: Promise<string> | null = null;

export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
}

// The most common passwords that pass the length rule (from public breach top lists).
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "12341234", "11223344", "87654321", "123123123",
  "password", "password1", "password12", "password123", "passw0rd", "qwertyui", "qwerty12",
  "qwerty123", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "abcd1234", "abc12345", "aa123456",
  "iloveyou", "sunshine", "princess", "football", "baseball", "welcome1", "letmein1",
  "admin123", "computer", "superman", "trustno1", "zxcvbnm1",
]);

export type PasswordProblem = "too-short" | "too-long" | "same-as-email" | "too-common";

/** Why a new password can't be used, or null when it's fine. */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  const length = [...password.normalize("NFC")].length;
  if (length < PASSWORD_MIN_LENGTH) return "too-short";
  if (length > PASSWORD_MAX_LENGTH) return "too-long";
  const lower = password.trim().toLowerCase();
  if (lower === email.trim().toLowerCase()) return "same-as-email";
  if (COMMON.has(lower) || new Set(lower).size === 1) return "too-common";
  return null;
}
