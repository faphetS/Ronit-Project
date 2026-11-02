import { createHash, createPublicKey, timingSafeEqual, verify, type JsonWebKeyInput, type KeyObject } from "node:crypto";
import { AppError } from "./errors.js";

/**
 * "Continue with Google", two ways in:
 * - Google's own button (Google Identity Services) hands the dashboard an ID token, which comes
 *   here through the browser, so its signature is checked against Google's published keys.
 * - The redirect flow (authorization code with PKCE, run from the server) is the fallback. Its
 *   ID token comes straight from Google's token endpoint over TLS, so its claims are checked
 *   and its signature needn't be (OpenID Connect Core 3.1.3.7).
 */
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const KEYS_URL = "https://www.googleapis.com/oauth2/v3/certs";
/** An unknown key id refetches Google's keys at most this often. */
const KEYS_REFETCH_MS = 60_000;
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
/** Clock drift allowed on the token's expiry. */
const SKEW_SECONDS = 60;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Must match the redirect URI registered on the OAuth client exactly. */
  redirectUri: string;
}

export interface GoogleIdentity {
  /** Google's stable id for the account; survives an email change. */
  sub: string;
  /** Verified by Google, lowercase. */
  email: string;
  name: string | null;
}

export interface GoogleSignIn {
  /** Where to send the browser for this state, nonce and PKCE challenge. */
  authorizeUrl(params: { state: string; nonce: string; codeChallenge: string }): string;
  /** Trades the code from the callback for the person's verified identity. */
  exchange(params: { code: string; codeVerifier: string; nonce: string }): Promise<GoogleIdentity>;
  /** Checks an ID token from Google's button: Google's signature, then the claims. */
  verifyCredential(params: { credential: string; nonce: string }): Promise<GoogleIdentity>;
}

const googleFailed = (why: string) => new AppError(502, `Google sign-in failed: ${why}`, "GOOGLE_FAILED");

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** PKCE S256 (RFC 7636): the challenge sent up front for the verifier kept until the callback. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Checks the claims of an ID token from Google's token endpoint. */
export function readIdToken(idToken: string, expected: { clientId: string; nonce: string; now: Date }): GoogleIdentity {
  const payload = idToken.split(".")[1];
  if (!payload) throw googleFailed("malformed ID token");
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw googleFailed("malformed ID token");
  }
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) throw googleFailed("wrong issuer");
  if (claims.aud !== expected.clientId) throw googleFailed("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp + SKEW_SECONDS < expected.now.getTime() / 1000) throw googleFailed("expired ID token");
  if (typeof claims.nonce !== "string" || !sameText(claims.nonce, expected.nonce)) throw googleFailed("nonce mismatch");
  if (typeof claims.sub !== "string" || claims.sub === "") throw googleFailed("no subject");
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (typeof claims.email !== "string" || !verified) throw googleFailed("email not verified");
  return { sub: claims.sub, email: claims.email.trim().toLowerCase(), name: typeof claims.name === "string" ? claims.name : null };
}

interface KeyCache {
  keys: Map<string, KeyObject>;
  fetchedAt: number;
  /** Until when Google says the keys may be cached (Cache-Control max-age). */
  until: number;
}

export function googleSignIn(config: GoogleConfig, options: { fetch?: typeof fetch; now?: () => Date } = {}): GoogleSignIn {
  const send = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => new Date());
  let keyCache: KeyCache | null = null;

  /** Google's public signing key for a key id. Google rotates them; a new id refetches, at most once a minute. */
  async function signingKey(kid: string): Promise<KeyObject> {
    const at = now().getTime();
    const stale = !keyCache || keyCache.until <= at;
    const unknownAndRefetchable = keyCache !== null && !keyCache.keys.has(kid) && at - keyCache.fetchedAt >= KEYS_REFETCH_MS;
    if (stale || unknownAndRefetchable) {
      let response: Response;
      try {
        response = await send(KEYS_URL, { signal: AbortSignal.timeout(15_000) });
      } catch {
        throw googleFailed("Google's keys unreachable");
      }
      const body = (await response.json().catch(() => null)) as { keys?: Array<JsonWebKeyInput["key"] & { kid?: string }> } | null;
      if (!response.ok || !Array.isArray(body?.keys)) throw googleFailed(`Google's keys answered ${response.status}`);
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 3600);
      const keys = new Map<string, KeyObject>();
      for (const jwk of body.keys) {
        if (typeof jwk.kid === "string") keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
      }
      keyCache = { keys, fetchedAt: at, until: at + maxAge * 1000 };
    }
    const key = keyCache?.keys.get(kid);
    if (!key) throw googleFailed("unknown signing key");
    return key;
  }

  return {
    authorizeUrl({ state, nonce, codeChallenge }) {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        // Lets someone with several Google accounts on one phone pick the registered one.
        prompt: "select_account",
      });
      return `${AUTHORIZE_URL}?${params}`;
    },

    async exchange({ code, codeVerifier, nonce }) {
      let response: Response;
      try {
        response = await send(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            grant_type: "authorization_code",
            code_verifier: codeVerifier,
          }).toString(),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw googleFailed("token endpoint unreachable");
      }
      const body = (await response.json().catch(() => null)) as { id_token?: unknown; error?: unknown } | null;
      if (!response.ok || typeof body?.id_token !== "string") {
        const reason = typeof body?.error === "string" ? ` (${body.error})` : "";
        throw googleFailed(`token endpoint answered ${response.status}${reason}`);
      }
      return readIdToken(body.id_token, { clientId: config.clientId, nonce, now: now() });
    },

    async verifyCredential({ credential, nonce }) {
      const [header, payload, signature] = credential.split(".");
      if (!header || !payload || !signature) throw googleFailed("malformed ID token");
      let head: { alg?: unknown; kid?: unknown };
      try {
        head = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: unknown; kid?: unknown };
      } catch {
        throw googleFailed("malformed ID token");
      }
      // Google signs ID tokens with RS256; anything else (like "none") is refused outright.
      if (head.alg !== "RS256" || typeof head.kid !== "string") throw googleFailed("unexpected token signature");
      const key = await signingKey(head.kid);
      if (!verify("sha256", Buffer.from(`${header}.${payload}`), key, Buffer.from(signature, "base64url"))) {
        throw googleFailed("bad token signature");
      }
      return readIdToken(credential, { clientId: config.clientId, nonce, now: now() });
    },
  };
}
