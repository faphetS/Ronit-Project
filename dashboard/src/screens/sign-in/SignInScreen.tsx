import { useCallback, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import { useGoogleCredential, useStartGoogle } from "../../data/queries";
import { SIGN_IN_ERRORS } from "../../data/services";
import { useServices } from "../../data/services-context";
import { Headline } from "../../ui/Headline";
import { EmailCodeStage } from "./EmailCodeStage";
import { GoogleButton } from "./GoogleButton";
import { GoogleIdentityButton } from "./GoogleIdentityButton";
import { SignInLayout } from "./SignInLayout";
import { signInMessage } from "./signInMessage";

/** Set in production: Google's own button. Unset (the demo, tests): our button, which skips Google on the demo data. */
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

/**
 * Sign in: Google's own "Continue as …" button for the email the office registered, then, on a
 * device that isn't remembered, the 6-digit code from the email. When Google's button can't
 * load, our button goes through Google by redirect instead, and the API sends the browser back
 * to /login?step=code, or /login?error=… when it didn't work.
 */
export function SignInScreen() {
  const { signIn: copy } = useCopy();
  const { locale } = useLocale();
  const { session } = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const startGoogle = useStartGoogle();
  const googleCredential = useGoogleCredential();
  const [stage, setStage] = useState<"google" | "code">(params.get("step") === "code" ? "code" : "google");
  const [remember, setRemember] = useState(true);
  const [googleButtonFailed, setGoogleButtonFailed] = useState(false);
  // A new key renders Google's button again, with a fresh nonce.
  const [googleButtonKey, setGoogleButtonKey] = useState(0);
  const [message, setMessage] = useState(() => {
    // "cancelled" (backing out of Google's page) isn't in the list, so it says nothing.
    const code = SIGN_IN_ERRORS.find((known) => known === params.get("error"));
    return code ? copy.errors[code] : "";
  });
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/";

  const beginRedirect = () => {
    setMessage("");
    startGoogle.mutate(
      { remember, returnTo },
      {
        onSuccess: (start) => {
          if ("redirectTo" in start) window.location.assign(start.redirectTo);
          else setStage("code");
        },
        onError: (error) => setMessage(signInMessage(copy, error)),
      },
    );
  };

  const getNonce = useCallback(() => session.googleNonce(), [session]);
  const fallBack = useCallback(() => setGoogleButtonFailed(true), []);
  const onCredential = useCallback(
    (credential: string) => {
      setMessage("");
      googleCredential.mutate(
        { credential, remember, returnTo },
        {
          onSuccess: (result) => {
            if (result.step === "signed-in") navigate(result.returnTo, { replace: true });
            else setStage("code");
          },
          onError: (error) => {
            setMessage(signInMessage(copy, error));
            setGoogleButtonKey((key) => key + 1);
          },
        },
      );
    },
    [googleCredential, remember, returnTo, navigate, copy],
  );

  const restart = useCallback((notice = "") => {
    setStage("google");
    setMessage(notice);
  }, []);

  return (
    <SignInLayout label={copy.title} message={message} onHelp={() => setMessage(copy.helpNotice)}>
      {stage === "google" ? (
        <>
          <Headline title={copy.title} size="display-3" className="mt-5 mb-2" />
          <p className="mb-5 text-small text-copy">{copy.intro}</p>
          {GOOGLE_CLIENT_ID && !googleButtonFailed ? (
            <GoogleIdentityButton
              key={googleButtonKey}
              clientId={GOOGLE_CLIENT_ID}
              locale={locale}
              getNonce={getNonce}
              onCredential={onCredential}
              onUnavailable={fallBack}
            />
          ) : (
            <GoogleButton label={copy.google} onClick={beginRedirect} disabled={startGoogle.isPending} />
          )}
          <label className="mt-4 flex items-center gap-2.5 px-2 text-small text-mute-2">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-[18px] accent-ink" />
            {copy.remember}
          </label>
        </>
      ) : (
        <EmailCodeStage onSignedIn={(to) => navigate(to, { replace: true })} onMessage={setMessage} onRestart={restart} />
      )}
    </SignInLayout>
  );
}
