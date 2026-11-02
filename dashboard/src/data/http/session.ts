import { SignInError, type GoogleCredentialResult, type PendingCode, type SessionService, type SignedIn, type SignInErrorCode } from "../services";
import type { Session, StaffUser } from "../types";
import { ApiError, type ApiClient } from "./client";

/**
 * Sign-in against /api/auth: Google's own button hands over an ID token for the server to check
 * (or, as a fallback, "Continue with Google" is a browser navigation through the API), then the
 * emailed code. The API keeps the session in an HttpOnly cookie, so no session token passes
 * through here.
 */

const ERRORS: Record<string, SignInErrorCode> = {
  NOT_REGISTERED: "not-registered",
  GOOGLE_FAILED: "google-failed",
  TOO_MANY_ATTEMPTS: "too-many-attempts",
  RATE_LIMITED: "too-many-attempts",
  INVALID_CODE: "invalid-code",
  CHALLENGE_EXPIRED: "step-expired",
  EMAIL_FAILED: "email-failed",
  RESEND_TOO_SOON: "resend-too-soon",
  SIGN_IN_UNAVAILABLE: "unavailable",
};

function translate(err: unknown): never {
  if (err instanceof ApiError && ERRORS[err.code]) throw new SignInError(ERRORS[err.code]);
  throw err;
}

export function createHttpSessionService(api: ApiClient): SessionService {
  return {
    async current() {
      try {
        const { session, user } = await api.get<{ session: Session; user: StaffUser }>("/api/auth/session");
        return { session, user };
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },

    async startGoogle({ remember, returnTo }) {
      const query = new URLSearchParams({ remember: remember ? "1" : "0", returnTo });
      return { redirectTo: api.url(`/api/auth/google?${query}`) };
    },

    async googleNonce() {
      return (await api.get<{ nonce: string }>("/api/auth/google/nonce")).nonce;
    },

    async googleCredential(credential, { remember, returnTo }) {
      type Body = ({ step: "signed-in"; returnTo: string } & SignedIn) | { step: "code-required" };
      const body = await api.post<Body>("/api/auth/google/credential", { credential, remember, returnTo }).catch(translate);
      if (body.step === "signed-in") {
        return { step: "signed-in", signedIn: { session: body.session, user: body.user }, returnTo: body.returnTo } satisfies GoogleCredentialResult;
      }
      return { step: "code-required" };
    },

    async pendingCode() {
      try {
        const { email } = await api.get<PendingCode>("/api/auth/code");
        return { email };
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },

    async resendCode() {
      await api.post("/api/auth/code/resend").catch(translate);
    },

    async verifyCode(code) {
      const body = await api.post<SignedIn & { returnTo: string }>("/api/auth/verify", { code }).catch(translate);
      return { signedIn: { session: body.session, user: body.user }, returnTo: body.returnTo };
    },

    async signOut() {
      await api.post("/api/auth/sign-out");
    },
  };
}
