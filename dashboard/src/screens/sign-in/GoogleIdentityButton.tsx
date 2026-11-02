import { useEffect, useRef } from "react";

/**
 * Google's own sign-in button (Google Identity Services). Signed in to Google in this browser,
 * it reads "Continue as …" with the account's name, and picking an account happens in Google's
 * own pop-up. Google hands back an ID token, which the server checks.
 */

interface CredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce?: string;
    ux_mode?: "popup" | "redirect";
    context?: "signin" | "signup" | "use";
    use_fedcm_for_button?: boolean;
    itp_support?: boolean;
    auto_select?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
      locale?: string;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const SCRIPT_URL = "https://accounts.google.com/gsi/client";
const LOAD_TIMEOUT_MS = 8000;
let loading: Promise<GoogleAccountsId> | null = null;

/** Loads Google's script once per page; a failed load can be tried again. */
function loadGoogle(): Promise<GoogleAccountsId> {
  loading ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    const ready = () => window.google?.accounts?.id;
    const existing = ready();
    if (existing) return resolve(existing);
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error("Google's sign-in script timed out")), LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      const id = ready();
      if (id) resolve(id);
      else reject(new Error("Google's sign-in script loaded without its API"));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Google's sign-in script didn't load"));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

interface GoogleIdentityButtonProps {
  clientId: string;
  /** The button's language: "he" or "en". */
  locale: string;
  /** Asks the server for the nonce Google puts in its answer. Keep it stable (useCallback). */
  getNonce: () => Promise<string>;
  onCredential: (credential: string) => void;
  /** Google's script or the nonce couldn't load (blocked, offline): show the fallback. Keep it stable. */
  onUnavailable: () => void;
}

export function GoogleIdentityButton({ clientId, locale, getNonce, onCredential, onUnavailable }: GoogleIdentityButtonProps) {
  const container = useRef<HTMLDivElement>(null);
  // Google keeps the callback it was first given; this ref lets it reach the latest one.
  const latestOnCredential = useRef(onCredential);

  useEffect(() => {
    latestOnCredential.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadGoogle(), getNonce()])
      .then(([id, nonce]) => {
        const parent = container.current;
        if (cancelled || !parent) return;
        id.initialize({
          client_id: clientId,
          nonce,
          callback: (response) => latestOnCredential.current(response.credential),
          ux_mode: "popup",
          context: "signin",
          use_fedcm_for_button: true,
          itp_support: true,
          auto_select: false,
        });
        parent.replaceChildren();
        id.renderButton(parent, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: Math.min(400, Math.max(200, parent.clientWidth || 320)),
          locale,
        });
      })
      .catch(() => {
        if (!cancelled) onUnavailable();
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, locale, getNonce, onUnavailable]);

  return <div ref={container} className="flex min-h-[44px] w-full justify-center" />;
}
