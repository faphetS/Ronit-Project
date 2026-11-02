import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useCopy } from "../../content/locale";
import { useCompleteSetupLink, useSetupLink } from "../../data/queries";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { LoadingBlock } from "../../ui/states";
import { SignInLayout } from "./SignInLayout";
import { signInMessage } from "./signInMessage";
import { TwoStepStage, type TwoStepState } from "./TwoStepStage";

type Stage = { kind: "password" } | TwoStepState;

/**
 * /setup/:token — an invite or password-reset link sent by the office. Sets the password, then
 * continues into the same steps as signing in: the codes the first time, the code after a reset.
 */
export function SetupLinkScreen() {
  const { token = "" } = useParams();
  const { signIn: copy } = useCopy();
  const navigate = useNavigate();
  const link = useSetupLink(token);
  const complete = useCompleteSetupLink(token);
  const [stage, setStage] = useState<Stage>({ kind: "password" });
  const [message, setMessage] = useState("");
  const done = () => navigate("/", { replace: true });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setMessage(copy.link.mismatch);
      return;
    }
    setMessage("");
    complete.mutate(
      { password, remember: form.get("remember") === "on" },
      {
        onSuccess: (step) => {
          if (step.step === "signed-in") done();
          else setStage(step.step === "code-required" ? { kind: "code" } : { kind: "setup", setup: step.setup });
        },
        onError: (error) => setMessage(signInMessage(copy, error)),
      },
    );
  };

  const words = link.data ? copy.link[link.data.purpose] : null;
  let content;
  if (link.isPending) {
    content = <LoadingBlock className="mt-5" />;
  } else if (link.isError || !link.data || !words) {
    content = (
      <>
        <Headline title={copy.title} size="display-3" className="mt-5 mb-4" />
        <p className="text-small text-copy">{signInMessage(copy, link.error)}</p>
        <Link to="/login" replace className="mt-4 inline-block text-small font-medium text-ink underline decoration-ink/30 underline-offset-4">
          {copy.submit}
        </Link>
      </>
    );
  } else if (stage.kind === "password") {
    content = (
      <>
        <Headline title={words.title} size="display-3" className="mt-5 mb-2" />
        <p className="mb-4 text-small text-copy">{words.body(link.data.name)}</p>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {/* Read-only, so password managers save the new password under the right email. */}
          <Field label={copy.email} icon="at" name="email" type="email" autoComplete="username" value={link.data.email} readOnly dir="ltr" />
          <Field label={copy.link.password} icon="key" name="password" type="password" autoComplete="new-password" />
          <Field label={copy.link.confirm} icon="key" name="confirm" type="password" autoComplete="new-password" />
          <p className="px-2 text-caption text-mute-2">{copy.link.rule}</p>
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2.5 px-2 text-small text-mute-2">
              <input type="checkbox" name="remember" defaultChecked className="size-[18px] accent-ink" />
              {copy.remember}
            </label>
            <GooButton type="submit" disabled={complete.isPending}>
              {copy.link.submit}
            </GooButton>
          </div>
        </form>
      </>
    );
  } else {
    // The link is used up by now: if this step runs out, the new password signs in as usual.
    content = <TwoStepStage state={stage} onSignedIn={done} onMessage={setMessage} onExpired={() => navigate("/login", { replace: true })} />;
  }

  return (
    <SignInLayout label={words?.title ?? copy.title} message={message} onHelp={() => setMessage(copy.helpNotice)}>
      {content}
    </SignInLayout>
  );
}
