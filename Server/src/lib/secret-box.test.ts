import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keyFromHex, openSecret, sealSecret } from "./secret-box.js";

const KEY = randomBytes(32);

describe("sealSecret / openSecret", () => {
  it("opens what it sealed, under the same context", () => {
    const plain = randomBytes(20);
    const sealed = sealSecret(plain, KEY, "totp:user-1");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(plain.toString("base64url"));
    expect(openSecret(sealed, KEY, "totp:user-1")).toEqual(plain);
  });

  it("never seals the same value the same way twice", () => {
    const plain = randomBytes(20);
    expect(sealSecret(plain, KEY, "c")).not.toBe(sealSecret(plain, KEY, "c"));
  });

  it("refuses another key, another context, or a changed byte", () => {
    const sealed = sealSecret(randomBytes(20), KEY, "totp:user-1");
    expect(() => openSecret(sealed, randomBytes(32), "totp:user-1")).toThrow();
    expect(() => openSecret(sealed, KEY, "totp:user-2")).toThrow();
    const parts = sealed.split(".");
    const body = Buffer.from(parts[3], "base64url");
    body[0] ^= 1;
    expect(() => openSecret([parts[0], parts[1], parts[2], body.toString("base64url")].join("."), KEY, "totp:user-1")).toThrow();
  });

  it("refuses a value in an unknown format", () => {
    expect(() => openSecret("v2.a.b.c", KEY, "c")).toThrow();
  });
});

describe("keyFromHex", () => {
  it("reads 64 hex characters as a 32-byte key", () => {
    expect(keyFromHex("ab".repeat(32))).toHaveLength(32);
    expect(() => keyFromHex("ab".repeat(16))).toThrow();
  });
});
