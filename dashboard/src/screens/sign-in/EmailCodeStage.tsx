import { useEffect, type FormEvent } from "react";
import { useCopy } from "../../content/locale";
import { usePendingCode, useResendCode, useVerifyCode } from "../../data/queries";
import { SignInError } from "../../data/services";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { Skeleton } from "../../ui/states";
import { signInMessage } from "./signInMessage";

const TEXT_BUTTON = "text-small font-medium text-ink underline decoration-ink/30 underline-offset-4 disabled:opacity-50";

interface EmailCodeStageProps {
  onSignedIn: (returnTo: string) => void;
  /** Shows a line in the card's status line; "" clears it. */
  onMessage: (message: string) => void;
  /** Back to "Continue with Google", with a notice or none. */
  onRestart: (notice?: string) => void;
}

/** After Google, on a device that isn't remembered: the 6-digit code from the email. */
export function EmailCodeStage({ onSignedIn, onMessage, onRestart }: EmailCodeStageProps) {
  const { signIn: copy } = useCopy();
  const pending = usePendingCode(true);
  const verify = useVerifyCode();
  const resend = useResendCode();
  const expired = pending.isSuccess && pending.data === null;

  useEffect(() => {
    if (expired) onRestart(copy.errors["step-expired"]);
  }, [expired, onRestart, copy]);

  const fail = (error: unknown) =>
    error instanceof SignInError && error.code === "step-expired" ? onRestart(copy.errors["step-expired"]) : onMessage(signInMessage(copy, error));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      onMessage(copy.errors["invalid-code"]);
      return;
    }
    onMessage("");
    verify.mutate(code, { onSuccess: ({ returnTo }) => onSignedIn(returnTo), onError: fail });
  };

  const sendAgain = () => {
    onMessage("");
    resend.mutate(undefined, { onSuccess: () => onMessage(copy.code.resent), onError: fail });
  };

  return (
    <>
      <Headline title={copy.code.title} size="display-3" className="mt-5 mb-2" />
      {pending.data ? <p className="mb-4 text-small text-copy">{copy.code.sentTo(pending.data.email)}</p> : <Skeleton className="mb-4 h-5 w-3/4" />}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={copy.code.label} icon="lock" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus dir="ltr" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 px-2">
            <button type="button" onClick={() => onRestart()} className={TEXT_BUTTON}>
              {copy.code.back}
            </button>
            <button type="button" onClick={sendAgain} disabled={resend.isPending} className={TEXT_BUTTON}>
              {copy.code.resend}
            </button>
          </div>
          <GooButton type="submit" disabled={verify.isPending}>
            {copy.code.submit}
          </GooButton>
        </div>
      </form>
    </>
  );
}
