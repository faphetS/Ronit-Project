import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { useCopy } from "../../content/locale";
import { useSignIn } from "../../data/queries";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { SignInLayout } from "./SignInLayout";
import { signInMessage } from "./signInMessage";
import { TwoStepStage, type TwoStepState } from "./TwoStepStage";

type Stage = { kind: "password" } | TwoStepState;

/** Sign in: email and password, then the 6-digit code (or setting the codes up the first time). */
export function SignInScreen() {
  const { signIn: copy } = useCopy();
  const navigate = useNavigate();
  const location = useLocation();
  const signInMutation = useSignIn();
  const [stage, setStage] = useState<Stage>({ kind: "password" });
  const [message, setMessage] = useState("");
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/";
  const done = () => navigate(returnTo, { replace: true });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setMessage(copy.errors["missing-credentials"]);
      return;
    }
    setMessage("");
    signInMutation.mutate(
      { email, password, remember: form.get("remember") === "on" },
      {
        onSuccess: (step) => {
          if (step.step === "signed-in") done();
          else setStage(step.step === "code-required" ? { kind: "code" } : { kind: "setup", setup: step.setup });
        },
        onError: (error) => setMessage(signInMessage(copy, error)),
      },
    );
  };

  const backToPassword = (notice = "") => {
    setStage({ kind: "password" });
    setMessage(notice);
  };

  return (
    <SignInLayout label={copy.title} message={message} onHelp={() => setMessage(copy.helpNotice)}>
      {stage.kind === "password" ? (
        <>
          <Headline title={copy.title} size="display-3" className="mt-5 mb-4" />
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label={copy.email} icon="at" name="email" type="email" autoComplete="username" />
            <Field
              label={copy.password}
              icon="key"
              name="password"
              type="password"
              autoComplete="current-password"
              trailing={
                <button type="button" onClick={() => setMessage(copy.forgotNotice)} className="inline-flex h-[42px] items-center rounded-full bg-paper px-4 text-small font-medium text-ink">
                  {copy.forgot}
                </button>
              }
            />
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2.5 px-2 text-small text-mute-2">
                <input type="checkbox" name="remember" defaultChecked className="size-[18px] accent-ink" />
                {copy.remember}
              </label>
              <GooButton type="submit" disabled={signInMutation.isPending}>
                {copy.submit}
              </GooButton>
            </div>
          </form>
        </>
      ) : (
        <TwoStepStage
          state={stage}
          onSignedIn={done}
          onMessage={setMessage}
          onExpired={() => backToPassword(copy.errors["step-expired"])}
          onBack={() => backToPassword()}
        />
      )}
    </SignInLayout>
  );
}
