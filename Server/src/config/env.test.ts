import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Keep a developer's Server/.env out of the picture: these tests are about the
// schema defaults, not about whatever happens to be on disk.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

const KEYS = [
  "IG_COMMENT_TRIP_ENABLED",
  "IG_COMMENT_BLOCKED_REPLY_ENABLED",
  "IG_MSG_COMMENT_REPLY_SENT",
  "IG_MSG_COMMENT_REPLY_BLOCKED",
] as const;

const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

async function loadEnv(overrides: Partial<Record<(typeof KEYS)[number], string>> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  return (await import("./env.js")).env;
}

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.resetModules();
});

describe("env — IG comment trip flow", () => {
  it("IG_COMMENT_TRIP_ENABLED defaults to true, and 'false' switches it off", async () => {
    expect((await loadEnv()).IG_COMMENT_TRIP_ENABLED).toBe(true);
    expect((await loadEnv({ IG_COMMENT_TRIP_ENABLED: "false" })).IG_COMMENT_TRIP_ENABLED).toBe(false);
  });

  it("IG_COMMENT_BLOCKED_REPLY_ENABLED defaults to true, and 'false' switches it off", async () => {
    expect((await loadEnv()).IG_COMMENT_BLOCKED_REPLY_ENABLED).toBe(true);
    expect((await loadEnv({ IG_COMMENT_BLOCKED_REPLY_ENABLED: "false" })).IG_COMMENT_BLOCKED_REPLY_ENABLED).toBe(
      false,
    );
  });

  // Expected values are written as code points on purpose: a retyped Hebrew literal
  // here could drift together with the one in env.ts, an escape sequence cannot.
  it("IG_MSG_COMMENT_REPLY_SENT default is byte-exact (ends with U+2764 U+FE0F)", async () => {
    const value = (await loadEnv()).IG_MSG_COMMENT_REPLY_SENT;
    expect(value).toBe(
      "נשלחה אלייך הודעה פרטית❤️",
    );
    expect(Buffer.byteLength(value, "utf8")).toBe(49);
  });

  it("IG_MSG_COMMENT_REPLY_BLOCKED default is byte-exact (carries the 0502696862 contact number)", async () => {
    const value = (await loadEnv()).IG_MSG_COMMENT_REPLY_BLOCKED;
    expect(value).toBe(
      "לא ניתן לשלוח לך הודעות תוכלי ליצור איתנו קשר 0502696862",
    );
    expect(Buffer.byteLength(value, "utf8")).toBe(93);
  });

  it("both reply templates can be overridden per variable", async () => {
    const env = await loadEnv({
      IG_MSG_COMMENT_REPLY_SENT: "sent override",
      IG_MSG_COMMENT_REPLY_BLOCKED: "blocked override",
    });
    expect(env.IG_MSG_COMMENT_REPLY_SENT).toBe("sent override");
    expect(env.IG_MSG_COMMENT_REPLY_BLOCKED).toBe("blocked override");
  });
});
