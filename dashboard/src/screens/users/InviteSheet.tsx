import { useState, type FormEvent } from "react";
import { useCopy } from "../../content/locale";
import { useInviteUser, useRemoveUser } from "../../data/queries";
import { ApiError } from "../../data/http/client";
import type { Role } from "../../data/types";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Field } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { Switch } from "../../ui/Switch";
import { useToast } from "../../ui/toast-context";
import { ROLES } from "./users-format";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Draft {
  email: string;
  name: string;
  role: Role;
  passportAccess: boolean;
}

const EMPTY: Draft = { email: "", name: "", role: "office", passportAccess: false };

/**
 * Gives someone an account: the email of the Google account they'll sign in with, their name, role and passport
 * access. The server emails the invite; sales never get passport access.
 */
export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { usersCopy: copy, uiCopy } = useCopy();
  const text = copy.inviteForm;
  const invite = useInviteUser();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [problem, setProblem] = useState("");
  const sales = draft.role === "sales";

  const close = () => {
    setDraft(EMPTY);
    setProblem("");
    onClose();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = draft.email.trim();
    const name = draft.name.trim();
    if (!name || !EMAIL.test(email)) {
      setProblem(text.invalid);
      return;
    }
    setProblem("");
    invite.mutate(
      { email, name, role: draft.role, passportAccess: !sales && draft.passportAccess },
      {
        onSuccess: ({ emailed }) => {
          toast.show(emailed ? { message: text.sent(email.toLowerCase()) } : { message: text.notEmailed, tone: "warning" });
          close();
        },
        onError: (error) => setProblem(error instanceof ApiError && error.code === "ALREADY_REGISTERED" ? text.exists : text.failed),
      },
    );
  };

  return (
    <Sheet open={open} onClose={close} title={text.title} description={text.body}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Field
          label={text.email}
          icon="at"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          dir="ltr"
          onPaper
          value={draft.email}
          onChange={(email) => setDraft({ ...draft, email })}
        />
        <Field label={text.name} icon="user" name="name" autoComplete="off" onPaper value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <div className="flex flex-col gap-2">
          <p className="text-small font-medium text-ink">{text.role}</p>
          <ChipGroup
            id="invite-role"
            label={text.role}
            options={ROLES.map((role) => ({ value: role, label: copy.roles[role] }))}
            value={draft.role}
            onChange={(role) => setDraft({ ...draft, role, passportAccess: role === "sales" ? false : draft.passportAccess })}
            onPaper
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="min-w-0">
            <p className="text-small font-medium text-ink">{text.passportAccess}</p>
            {sales ? <p className="text-caption text-mute">{text.salesNoPassports}</p> : null}
          </div>
          {sales ? null : <Switch checked={draft.passportAccess} onChange={(passportAccess) => setDraft({ ...draft, passportAccess })} label={text.passportAccess} />}
        </div>
        <p role="status" className="min-h-5 text-small text-status-warning">
          {problem}
        </p>
        <div className="flex gap-2.5">
          <Button type="submit" disabled={invite.isPending} className="flex-1 lg:flex-none">
            {text.send}
          </Button>
          <Button variant="outline" onClick={close} className="flex-1 lg:flex-none">
            {uiCopy.cancel}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

interface RemoveUserProps {
  userId: string;
  /** The person's name, or the invite's email. */
  name: string;
  invite: boolean;
}

/** "הסרה" in the users table: asks first, then closes the account and signs them out everywhere. */
export function RemoveUserButton({ userId, name, invite }: RemoveUserProps) {
  const { usersCopy: copy } = useCopy();
  const text = copy.remove;
  const remove = useRemoveUser();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const confirm = () =>
    remove.mutate(userId, {
      onSuccess: () => {
        setConfirming(false);
        toast.show({ message: text.done });
      },
      onError: () => {
        setConfirming(false);
        toast.show({ message: text.failed, tone: "warning" });
      },
    });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        {invite ? text.cancelInvite : text.action}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={text.title(name)}
        description={text.body}
        confirmLabel={text.confirm}
        pending={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </>
  );
}
