import { useState, type FormEvent } from "react";
import { useCopy } from "../../content/locale";
import { usePasswordSignIn } from "../../data/queries";
import { cx } from "../../lib/cx";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Icon } from "../../ui/Icon";
import { signInMessage } from "./signInMessage";

interface PasswordFormProps {
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
  /** The page to land on. */
  returnTo: string;
  onSignedIn: (returnTo: string) => void;
  /** A device that isn't remembered: the emailed code is next. */
  onCodeRequired: () => void;
  /** Shows a line in the card's status line; "" clears it. */
  onMessage: (message: string) => void;
}

/**
 * The username (or email) and password, with "remember me" beside the button. "Remember me"
 * covers Google too, which sits under this form as the shortcut.
 */
export function PasswordForm({ remember, onRememberChange, returnTo, onSignedIn, onCodeRequired, onMessage }: PasswordFormProps) {
  const { signIn: copy } = useCopy();
  const signIn = usePasswordSignIn();
  const [shown, setShown] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!login || !password) {
      onMessage(copy.missing);
      return;
    }
    onMessage("");
    signIn.mutate(
      { login, password, remember, returnTo },
      {
        onSuccess: (result) => (result.step === "signed-in" ? onSignedIn(result.returnTo) : onCodeRequired()),
        onError: (error) => onMessage(signInMessage(copy, error)),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Field label={copy.login} icon="user" name="login" autoComplete="username" dir="ltr" spellCheck={false} />
      <Field
        label={copy.password}
        icon="lock"
        name="password"
        type={shown ? "text" : "password"}
        autoComplete="current-password"
        dir="ltr"
        spellCheck={false}
        trailing={
          <button
            type="button"
            onClick={() => setShown((value) => !value)}
            aria-pressed={shown}
            aria-label={copy.showPassword}
            className={cx(
              "me-1.5 grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-ink",
              shown ? "text-ink" : "text-mute",
            )}
          >
            <Icon name="eye" size={16} />
          </button>
        }
      />
      <div className="mt-1 flex items-center justify-between gap-4">
        <label className="flex items-center gap-2.5 px-2 text-small text-mute-2">
          <input type="checkbox" checked={remember} onChange={(event) => onRememberChange(event.target.checked)} className="size-[18px] accent-ink" />
          {copy.remember}
        </label>
        <GooButton type="submit" disabled={signIn.isPending}>
          {copy.submit}
        </GooButton>
      </div>
    </form>
  );
}
