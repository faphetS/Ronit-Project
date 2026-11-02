import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { googleSignIn, pkceChallenge, readIdToken } from "./google-oidc.js";

const CONFIG = { clientId: "client-1.apps.googleusercontent.com", clientSecret: "secret", redirectUri: "https://api.example.com/api/auth/google/callback" };
const NOW = new Date("2026-11-02T10:00:00Z");
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** An ID token as Google's token endpoint returns it; the signature part isn't checked. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", kid: "k1" })}.${part(claims)}.signature`;
}

const GOOD = {
  iss: "https://accounts.google.com",
  aud: CONFIG.clientId,
  sub: "1234567890",
  email: "Ronit@Gmail.com",
  email_verified: true,
  name: "רונית ברש",
  nonce: "nonce-1",
  iat: seconds(NOW) - 5,
  exp: seconds(NOW) + 3600,
};

describe("pkceChallenge", () => {
  it("matches the RFC 7636 example", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("readIdToken", () => {
  const expected = { clientId: CONFIG.clientId, nonce: "nonce-1", now: NOW };

  it("returns the verified identity, email lowercase", () => {
    expect(readIdToken(idToken(GOOD), expected)).toEqual({ sub: "1234567890", email: "ronit@gmail.com", name: "רונית ברש" });
    expect(readIdToken(idToken({ ...GOOD, iss: "accounts.google.com", name: undefined }), expected)).toMatchObject({ name: null });
  });

  it("refuses a token meant for someone else, stale, replayed or unverified", () => {
    const bad = (claims: Record<string, unknown>) => () => readIdToken(idToken({ ...GOOD, ...claims }), expected);
    expect(bad({ iss: "https://evil.example.com" })).toThrow(/issuer/);
    expect(bad({ aud: "another-client" })).toThrow(/audience/);
    expect(bad({ exp: seconds(NOW) - 120 })).toThrow(/expired/);
    expect(bad({ nonce: "nonce-2" })).toThrow(/nonce/);
    expect(bad({ email_verified: false })).toThrow(/verified/);
    expect(bad({ sub: "" })).toThrow(/subject/);
    expect(() => readIdToken("not-a-jwt", expected)).toThrow(/malformed/);
  });
});

describe("googleSignIn", () => {
  it("sends the browser to Google with PKCE, a nonce and the account picker", () => {
    const url = new URL(googleSignIn(CONFIG).authorizeUrl({ state: "s1", nonce: "n1", codeChallenge: "c1" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CONFIG.clientId,
      redirect_uri: CONFIG.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: "s1",
      nonce: "n1",
      code_challenge: "c1",
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });

  it("trades the code for the identity", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ id_token: idToken(GOOD) }), { status: 200 }));
    const google = googleSignIn(CONFIG, { fetch, now: () => NOW });
    await expect(google.exchange({ code: "code-1", codeVerifier: "verifier-1", nonce: "nonce-1" })).resolves.toMatchObject({ sub: "1234567890" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      code: "code-1",
      client_id: CONFIG.clientId,
      client_secret: "secret",
      redirect_uri: CONFIG.redirectUri,
      grant_type: "authorization_code",
      code_verifier: "verifier-1",
    });
  });

  it("fails cleanly when Google refuses the code or can't be reached", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    const google = googleSignIn(CONFIG, { fetch, now: () => NOW });
    const exchange = () => google.exchange({ code: "c", codeVerifier: "v", nonce: "nonce-1" });
    await expect(exchange()).rejects.toMatchObject({ code: "GOOGLE_FAILED", message: expect.stringContaining("invalid_grant") });
    await expect(exchange()).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
  });
});

describe("verifyCredential (Google's button)", () => {
  // Stands in for Google: its own key pair, published as Google publishes its keys.
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const JWKS = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "google-1", alg: "RS256", use: "sig" }] };

  function signed(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "google-1" }): string {
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const body = `${part(header)}.${part(claims)}`;
    return `${body}.${sign("sha256", Buffer.from(body), privateKey).toString("base64url")}`;
  }

  function keysFetch() {
    return vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify(JWKS), { status: 200, headers: { "Cache-Control": "public, max-age=3600" } }));
  }

  it("accepts a token Google signed, and keeps the keys for as long as Google allows", async () => {
    const fetch = keysFetch();
    const google = googleSignIn(CONFIG, { fetch, now: () => NOW });
    await expect(google.verifyCredential({ credential: signed(GOOD), nonce: "nonce-1" })).resolves.toEqual({ sub: "1234567890", email: "ronit@gmail.com", name: "רונית ברש" });
    await google.verifyCredential({ credential: signed(GOOD), nonce: "nonce-1" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://www.googleapis.com/oauth2/v3/certs");
  });

  it("refuses a changed token, another signature scheme, an unknown key or a replayed nonce", async () => {
    const google = googleSignIn(CONFIG, { fetch: keysFetch(), now: () => NOW });
    const check = (credential: string) => google.verifyCredential({ credential, nonce: "nonce-1" });

    const [h, , s] = signed(GOOD).split(".");
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...GOOD, email: "attacker@gmail.com" })).toString("base64url")}.${s}`;
    await expect(check(tampered)).rejects.toMatchObject({ code: "GOOGLE_FAILED", message: expect.stringContaining("signature") });
    await expect(check(signed(GOOD, { alg: "none", kid: "google-1" }))).rejects.toMatchObject({ message: expect.stringContaining("unexpected token signature") });
    await expect(check(signed(GOOD, { alg: "RS256", kid: "rotated-away" }))).rejects.toMatchObject({ message: expect.stringContaining("unknown signing key") });
    await expect(google.verifyCredential({ credential: signed(GOOD), nonce: "another-nonce" })).rejects.toMatchObject({ message: expect.stringContaining("nonce") });
    await expect(check("not.a-token")).rejects.toMatchObject({ code: "GOOGLE_FAILED" });
  });
});
