import { useMemo, type FormEvent } from "react";
import { renderSVG } from "uqr";
import { useShell } from "../../app/useShell";
import { useCopy } from "../../content/locale";
import { useVerifyCode } from "../../data/queries";
import { SignInError, type TwoStepSetup } from "../../data/services";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { useToast } from "../../ui/toast-context";
import { signInMessage } from "./signInMessage";

/** The step after the password: the code, or adding the key to the app and then the code. */
export type TwoStepState = { kind: "code" } | { kind: "setup"; setup: TwoStepSetup };

interface TwoStepStageProps {
  state: TwoStepState;
  onSignedIn: () => void;
  /** Shows a refusal in the card's status line; "" clears it. */
  onMessage: (message: string) => void;
  /** The step ran out (10 minutes, or 5 tries): the password is needed again. */
  onExpired: () => void;
  onBack?: () => void;
}

export function TwoStepStage({ state, onSignedIn, onMessage, onExpired, onBack }: TwoStepStageProps) {
  const { signIn: copy } = useCopy();
  const verify = useVerifyCode();
  const setup = state.kind === "setup" ? state.setup : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      onMessage(copy.errors["invalid-code"]);
      return;
    }
    onMessage("");
    verify.mutate(code, {
      onSuccess: onSignedIn,
      onError: (error) => (error instanceof SignInError && error.code === "step-expired" ? onExpired() : onMessage(signInMessage(copy, error))),
    });
  };

  return (
    <>
      <Headline title={setup ? copy.setup.title : copy.code.title} size="display-3" className="mt-5 mb-4" />
      {setup ? <KeySetup setup={setup} /> : <p className="mb-4 text-small text-copy">{copy.code.body}</p>}
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
        <Field label={copy.code.label} icon="lock" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus dir="ltr" />
        <div className="flex items-center justify-between gap-4">
          {onBack ? (
            <button type="button" onClick={onBack} className="px-2 text-small font-medium text-ink underline decoration-ink/30 underline-offset-4">
              {copy.code.back}
            </button>
          ) : (
            <span />
          )}
          <GooButton type="submit" disabled={verify.isPending}>
            {setup ? copy.setup.submit : copy.code.submit}
          </GooButton>
        </div>
      </form>
    </>
  );
}

/** Adding the key: a QR code on desktop, a link that opens the authenticator on phones, and the key to type or copy. */
function KeySetup({ setup }: { setup: TwoStepSetup }) {
  const { signIn: copy } = useCopy();
  const phone = useShell() === "phone";
  const toast = useToast();
  const qr = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(setup.otpauthUrl, { ecc: "M", blackColor: "#1c1a18", whiteColor: "#ffffff" }))}`,
    [setup.otpauthUrl],
  );
  const grouped = setup.secret.match(/.{1,4}/g)?.join(" ") ?? setup.secret;

  const copyKey = () => {
    // Without clipboard access the key can still be selected by hand.
    navigator.clipboard?.writeText(setup.secret).then(() => toast.show({ message: copy.setup.copied }), () => undefined);
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1.5 ps-5 text-small text-copy">
        <li>{copy.setup.open}</li>
        <li>{phone ? copy.setup.tap : copy.setup.scan}</li>
        <li>{copy.setup.type}</li>
      </ol>
      {phone ? (
        <a href={setup.otpauthUrl} className="inline-flex h-[46px] items-center justify-center self-start rounded-full bg-ink px-5 text-small font-medium text-cream">
          {copy.setup.addToApp}
        </a>
      ) : (
        <img src={qr} alt={copy.setup.qr} className="size-[172px] self-center rounded-2xl bg-white p-3" />
      )}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/45 px-4 py-3 ring-1 ring-inset ring-white/80">
        <div className="min-w-0">
          <p className="text-caption text-mute-2">{copy.setup.key}</p>
          <p dir="ltr" className="font-medium tracking-wider break-all text-ink select-all">
            {grouped}
          </p>
        </div>
        <button type="button" onClick={copyKey} className="shrink-0 rounded-full bg-paper px-4 py-2 text-small font-medium text-ink">
          {copy.setup.copy}
        </button>
      </div>
    </div>
  );
}
