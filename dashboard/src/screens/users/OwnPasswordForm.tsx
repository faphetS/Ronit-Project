import { useState, type FormEvent } from "react";
import { useCopy } from "../../content/locale";
import { ApiError } from "../../data/http/client";
import { useChangeOwnPassword } from "../../data/queries";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { useToast } from "../../ui/toast-context";

/** At least this many characters, as the server checks. */
export const PASSWORD_MIN = 8;

interface OwnPasswordFormProps {
  size?: "md" | "sm";
  /** On white cards (the phone's sheet), not glass. */
  onPaper?: boolean;
  onDone: () => void;
}

/**
 * Your own password, from the account panel on desktop and the account screen on phones: the
 * current one, then the new one. Only for people who have one: a first password is the office's
 * to set.
 */
export function OwnPasswordForm({ size = "md", onPaper = false, onDone }: OwnPasswordFormProps) {
  const { usersCopy } = useCopy();
  const copy = usersCopy.password;
  const change = useChangeOwnPassword();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [problem, setProblem] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ([...next].length < PASSWORD_MIN) {
      setProblem(copy.short);
      return;
    }
    if (!current) {
      setProblem(copy.wrong);
      return;
    }
    setProblem("");
    change.mutate(
      { current, next },
      {
        onSuccess: () => {
          toast.show({ message: copy.saved });
          onDone();
        },
        onError: (error) => {
          const code = error instanceof ApiError ? error.code : "";
          setProblem(code === "WRONG_PASSWORD" ? copy.wrong : code === "TOO_MANY_ATTEMPTS" ? copy.tooMany : code === "WEAK_PASSWORD" ? copy.short : copy.failed);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <Field
        label={copy.current}
        icon="lock"
        name="current-password"
        type="password"
        autoComplete="current-password"
        dir="ltr"
        spellCheck={false}
        size={size}
        onPaper={onPaper}
        value={current}
        onChange={setCurrent}
      />
      <Field
        label={copy.next}
        icon="key"
        name="new-password"
        type="password"
        autoComplete="new-password"
        dir="ltr"
        spellCheck={false}
        size={size}
        onPaper={onPaper}
        value={next}
        onChange={setNext}
      />
      <p className="px-2 text-caption text-mute">{copy.rule}</p>
      <p role="status" className="min-h-5 px-2 text-small text-status-warning empty:min-h-0">
        {problem}
      </p>
      <div className="flex justify-end">
        <GooButton type="submit" size="sm" icon="check" disabled={change.isPending}>
          {copy.save}
        </GooButton>
      </div>
    </form>
  );
}
