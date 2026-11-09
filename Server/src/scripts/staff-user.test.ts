import { describe, expect, it, vi } from "vitest";

vi.mock("../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { parseStaffArgs } from "./staff-user.js";

describe("parseStaffArgs", () => {
  it("reads an invite", () => {
    expect(parseStaffArgs(["invite", "--email", "ronit@example.com", "--name", "רונית ברש", "--role", "admin", "--passport-access", "--phone", "050-123-4567"])).toEqual({
      command: "invite",
      email: "ronit@example.com",
      name: "רונית ברש",
      role: "admin",
      passportAccess: true,
      whatsappPhone: "972501234567",
      username: null,
      passwordFromStdin: false,
    });
  });

  it("reads a username, and a password that comes on standard input", () => {
    expect(
      parseStaffArgs(["invite", "--email", "office@example.com", "--name", "Office", "--role", "office", "--username", " office ", "--password-stdin"]),
    ).toMatchObject({ username: "office", passwordFromStdin: true });
    expect(parseStaffArgs(["set-sign-in", "--email", "office@example.com", "--password-stdin"])).toEqual({
      command: "set-sign-in",
      email: "office@example.com",
      username: undefined,
      passwordFromStdin: true,
    });
    expect(parseStaffArgs(["set-sign-in", "--email", "office@example.com", "--username", ""])).toMatchObject({ username: "", passwordFromStdin: false });
    // Nothing to change, and no password on the command line.
    expect(() => parseStaffArgs(["set-sign-in", "--email", "office@example.com"])).toThrow(/Usage/);
    expect(() => parseStaffArgs(["set-sign-in", "--email", "office@example.com", "--password", "secret"])).toThrow();
  });

  it("defaults to no passport access and no phone", () => {
    expect(parseStaffArgs(["invite", "--email", "shira@example.com", "--name", "שירה", "--role", "office"])).toMatchObject({
      passportAccess: false,
      whatsappPhone: null,
    });
  });

  it("reads two-step, which takes exactly one of --off and --on", () => {
    expect(parseStaffArgs(["two-step", "--email", "office@example.com", "--off"])).toEqual({ command: "two-step", email: "office@example.com", exempt: true });
    expect(parseStaffArgs(["two-step", "--email", "office@example.com", "--on"])).toEqual({ command: "two-step", email: "office@example.com", exempt: false });
    expect(() => parseStaffArgs(["two-step", "--email", "office@example.com"])).toThrow(/Usage/);
    expect(() => parseStaffArgs(["two-step", "--email", "office@example.com", "--off", "--on"])).toThrow(/Usage/);
  });

  it("reads the other commands", () => {
    expect(parseStaffArgs(["reset-sign-in", "--email", "ronit@example.com"])).toEqual({ command: "reset-sign-in", email: "ronit@example.com" });
    expect(parseStaffArgs(["disable", "--email", "ronit@example.com"])).toEqual({ command: "disable", email: "ronit@example.com" });
  });

  it("refuses an unknown command, a missing email or a made-up role", () => {
    expect(() => parseStaffArgs(["promote", "--email", "ronit@example.com"])).toThrow(/Usage/);
    expect(() => parseStaffArgs(["reset-sign-in"])).toThrow(/Usage/);
    expect(() => parseStaffArgs(["invite", "--email", "a@example.com", "--name", "A", "--role", "owner"])).toThrow(/Usage/);
    expect(() => parseStaffArgs(["invite", "--email", "a@example.com", "--role", "admin", "--bogus"])).toThrow();
  });
});
