import { describe, expect, it } from "vitest";
import { burnPasswordCheck, hashPassword, passwordLength, verifyPassword } from "./passwords.js";

describe("passwords", () => {
  it("checks a password against its hash, and nothing else", async () => {
    const stored = await hashPassword("Shalom-Uman-2026");
    expect(stored).toMatch(/^scrypt\$32768\$8\$3\$[\w-]{22}\$[\w-]{43}$/);
    expect(await verifyPassword("Shalom-Uman-2026", stored)).toBe(true);
    expect(await verifyPassword("shalom-uman-2026", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts every hash, so the same password never gives the same hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
  });

  it("reads the same letters typed on another keyboard as the same password", async () => {
    const composed = "café-ronit";
    const decomposed = "café-ronit";
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true);
  });

  it("turns away a stored value that isn't one of its hashes", async () => {
    const stored = await hashPassword("password-1");
    const [, , , , salt, key] = stored.split("$");
    for (const bad of ["", "plain-text", `bcrypt$32768$8$3$${salt}$${key}`, `scrypt$1000$8$3$${salt}$${key}`, `scrypt$32768$64$3$${salt}$${key}`, `scrypt$32768$8$3$$${key}`]) {
      expect(await verifyPassword("password-1", bad)).toBe(false);
    }
  });

  it("counts letters, not bytes", async () => {
    expect(passwordLength("שלום")).toBe(4);
    expect(passwordLength("🔑🔑")).toBe(2);
    await expect(burnPasswordCheck("anything")).resolves.toBeUndefined();
  });
});
