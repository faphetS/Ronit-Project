import { useCallback, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useCopy } from "../../content/locale";
import { useStartGoogle } from "../../data/queries";
import { SIGN_IN_ERRORS } from "../../data/services";
import { Headline } from "../../ui/Headline";
import { EmailCodeStage } from "./EmailCodeStage";
import { GoogleButton } from "./GoogleButton";
import { SignInLayout } from "./SignInLayout";
import { signInMessage } from "./signInMessage";

/**
 * Sign in: "Continue with Google" for the email the office registered, then, on a device that
 * isn't remembered, the 6-digit code from the email. Google sends the browser back through the
 * API to /login?step=code, or /login?error=… when it didn't work.
 */
export function SignInScreen() {
  const { signIn: copy } = useCopy();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const startGoogle = useStartGoogle();
  const [stage, setStage] = useState<"google" | "code">(params.get("step") === "code" ? "code" : "google");
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState(() => {
    // "cancelled" (backing out of Google's page) isn't in the list, so it says nothing.
    const code = SIGN_IN_ERRORS.find((known) => known === params.get("error"));
    return code ? copy.errors[code] : "";
  });
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/";

  const begin = () => {
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
          <GoogleButton label={copy.google} onClick={begin} disabled={startGoogle.isPending} />
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
