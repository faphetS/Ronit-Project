import { describe, expect, it, vi } from "vitest";
import { SignInError } from "../services";
import { ApiError, createApiClient } from "./client";
import { createHttpSessionService } from "./session";

const USER = { id: "u1", name: "רונית ברש", initial: "ר", role: "admin", passportAccess: true };
const SESSION = { userId: "u1", signedInAt: "2026-11-02T10:00:00.000Z" };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A session service over a fake fetch that answers with `responses` in order. */
function setup(...responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  const session = createHttpSessionService(createApiClient({ baseUrl: "https://api.example.com/", fetch }));
  return { fetch, session };
}

describe("createApiClient", () => {
  it("sends JSON with the cookie, and reads the API's error codes", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(403, { status: "error", code: "ORIGIN_NOT_ALLOWED", message: "No" }));
    const api = createApiClient({ baseUrl: "https://api.example.com", fetch });
    await expect(api.post("/api/auth/sign-out")).rejects.toMatchObject({ status: 403, code: "ORIGIN_NOT_ALLOWED" });
    expect(fetch).toHaveBeenCalledWith("https://api.example.com/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("turns a failed connection and a non-JSON error into ApiErrors", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(new Response("Bad gateway", { status: 502, statusText: "Bad Gateway" }));
    const api = createApiClient({ baseUrl: "", fetch });
    await expect(api.get("/x")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
    await expect(api.get("/x")).rejects.toMatchObject({ status: 502, code: "HTTP_ERROR" });
  });
});

describe("createHttpSessionService", () => {
  it("reads the session, and no session on 401", async () => {
    const { session, fetch } = setup(json(200, { status: "ok", session: SESSION, user: USER }), json(401, { status: "error", code: "UNAUTHENTICATED" }));
    await expect(session.current()).resolves.toEqual({ session: SESSION, user: USER });
    await expect(session.current()).resolves.toBeNull();
    expect(fetch.mock.calls[0][0]).toBe("https://api.example.com/api/auth/session");
  });

  it("passes on other failures of the session check", async () => {
    const { session } = setup(json(503, { status: "error", code: "SIGN_IN_UNAVAILABLE" }));
    await expect(session.current()).rejects.toBeInstanceOf(ApiError);
  });

  it("signs in through each step", async () => {
    const setupBody = { secret: "JBSWY3DPEHPK3PXP", otpauthUrl: "otpauth://totp/x" };
    const { session, fetch } = setup(
      json(200, { status: "ok", step: "code-required" }),
      json(200, { status: "ok", step: "setup-required", setup: setupBody }),
      json(200, { status: "ok", step: "signed-in", session: SESSION, user: USER }),
    );
    await expect(session.signIn("ronit@example.com", "pw", true)).resolves.toEqual({ step: "code-required" });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ email: "ronit@example.com", password: "pw", remember: true });
    await expect(session.completeSetupLink("tok/en", "a new password", false)).resolves.toEqual({ step: "setup-required", setup: setupBody });
    expect(fetch.mock.calls[1][0]).toBe("https://api.example.com/api/auth/setup-links/tok%2Fen");
    await expect(session.verifyCode("123456")).resolves.toEqual({ session: SESSION, user: USER });
  });

  it("words the API's refusals as sign-in errors", async () => {
    const { session } = setup(
      json(401, { status: "error", code: "INVALID_CREDENTIALS" }),
      json(429, { status: "error", code: "TOO_MANY_ATTEMPTS" }),
      json(401, { status: "error", code: "CHALLENGE_EXPIRED" }),
      json(400, { status: "error", code: "PASSWORD_TOO_COMMON" }),
      json(400, { status: "error", code: "VALIDATION_ERROR" }),
    );
    await expect(session.signIn("a@b.c", "x", false)).rejects.toEqual(new SignInError("invalid-credentials"));
    await expect(session.signIn("a@b.c", "x", false)).rejects.toEqual(new SignInError("too-many-attempts"));
    await expect(session.verifyCode("123456")).rejects.toEqual(new SignInError("step-expired"));
    await expect(session.completeSetupLink("t", "password1", false)).rejects.toEqual(new SignInError("password-too-common"));
    await expect(session.setupLink("bad")).rejects.toEqual(new SignInError("link-invalid"));
  });
});
