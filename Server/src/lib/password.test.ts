import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password.js";

describe("hashPassword / verifyPassword", () => {
  it("verifies the same password and refuses another", async () => {
    const stored = await hashPassword("a long enough secret");
    expect(stored).toMatch(/^scrypt\$32768\$8\$3\$[\w+/=]+\$[\w+/=]+$/);
    await expect(verifyPassword("a long enough secret", stored)).resolves.toBe(true);
    await expect(verifyPassword("a long enough secreT", stored)).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("treats the two Unicode spellings of the same letter as one password", async () => {
    const composed = "café-1234"; // é as one code point
    const decomposed = "café-1234"; // e + combining acute
    await expect(verifyPassword(decomposed, await hashPassword(composed))).resolves.toBe(true);
  });

  it("refuses a stored value it can't read rather than throwing", async () => {
    await expect(verifyPassword("anything", "md5$abc")).resolves.toBe(false);
  });
});

describe("passwordProblem", () => {
  it("accepts a reasonable password", () => {
    expect(passwordProblem("שמש בירושלים 7", "ronit@example.com")).toBeNull();
  });

  it("names what's wrong", () => {
    expect(passwordProblem("short", "ronit@example.com")).toBe("too-short");
    expect(passwordProblem("x".repeat(129), "ronit@example.com")).toBe("too-long");
    expect(passwordProblem("Ronit@Example.com", "ronit@example.com")).toBe("same-as-email");
    expect(passwordProblem("password123", "ronit@example.com")).toBe("too-common");
    expect(passwordProblem("aaaaaaaaaa", "ronit@example.com")).toBe("too-common");
  });
});
