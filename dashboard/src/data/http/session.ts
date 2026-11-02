import { SignInError, type SessionService, type SetupLinkInfo, type SignedIn, type SignInErrorCode, type SignInStep, type TwoStepSetup } from "../services";
import type { Session, StaffUser } from "../types";
import { ApiError, type ApiClient } from "./client";

/** Sign-in against /api/auth. The API keeps the session in an HttpOnly cookie, so no token passes through here. */

type StepBody =
  | ({ step: "signed-in" } & SignedIn)
  | { step: "code-required" }
  | { step: "setup-required"; setup: TwoStepSetup };

const ERRORS: Record<string, SignInErrorCode> = {
  INVALID_CREDENTIALS: "invalid-credentials",
  TOO_MANY_ATTEMPTS: "too-many-attempts",
  RATE_LIMITED: "too-many-attempts",
  INVALID_CODE: "invalid-code",
  CHALLENGE_EXPIRED: "step-expired",
  LINK_INVALID: "link-invalid",
  PASSWORD_TOO_SHORT: "password-too-short",
  PASSWORD_TOO_LONG: "password-too-long",
  PASSWORD_SAME_AS_EMAIL: "password-same-as-email",
  PASSWORD_TOO_COMMON: "password-too-common",
};

function translate(err: unknown): never {
  if (err instanceof ApiError && ERRORS[err.code]) throw new SignInError(ERRORS[err.code]);
  throw err;
}

function toStep(body: StepBody): SignInStep {
  switch (body.step) {
    case "signed-in":
      return { step: "signed-in", signedIn: { session: body.session, user: body.user } };
    case "setup-required":
      return { step: "setup-required", setup: body.setup };
    default:
      return { step: "code-required" };
  }
}

const linkPath = (token: string) => `/api/auth/setup-links/${encodeURIComponent(token)}`;

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

    signIn: (email, password, remember) => api.post<StepBody>("/api/auth/sign-in", { email, password, remember }).then(toStep, translate),

    async verifyCode(code) {
      const step = await api.post<StepBody>("/api/auth/verify", { code }).then(toStep, translate);
      if (step.step !== "signed-in") throw new SignInError("step-expired");
      return step.signedIn;
    },

    async setupLink(token) {
      try {
        return (await api.get<{ link: SetupLinkInfo }>(linkPath(token))).link;
      } catch (err) {
        // A malformed token is refused before the lookup (400); to the person it's the same dead link.
        if (err instanceof ApiError && (err.status === 400 || err.status === 404)) throw new SignInError("link-invalid");
        throw err;
      }
    },

    completeSetupLink: (token, password, remember) => api.post<StepBody>(linkPath(token), { password, remember }).then(toStep, translate),

    async signOut() {
      await api.post("/api/auth/sign-out");
    },
  };
}
