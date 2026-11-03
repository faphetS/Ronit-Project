import { useState, type FormEvent } from "react";
import { useCopy } from "../../content/locale";
import { useChangeAccess, useInviteUser, useRemoveUser } from "../../data/queries";
import { ApiError } from "../../data/http/client";
import type { AccessInput } from "../../data/services";
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

interface AccessFieldsProps {
  /** Unique per form, so the role highlight glides only inside it. */
  id: string;
  value: AccessInput;
  onChange: (value: AccessInput) => void;
  /** Your own role: shown, but another admin changes it. */
  roleLocked?: boolean;
}

/** The role chips and the passport switch, shared by the invite and the edit forms. Sales never get passport access. */
function AccessFields({ id, value, onChange, roleLocked = false }: AccessFieldsProps) {
  const { usersCopy: copy } = useCopy();
  const text = copy.inviteForm;
  const sales = value.role === "sales";
  const pickRole = (role: Role) => onChange({ role, passportAccess: role === "sales" ? false : value.passportAccess });
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-small font-medium text-ink">{text.role}</p>
        {roleLocked ? (
          <p className="text-small text-mute">
            {copy.roles[value.role]} · {copy.edit.ownRole}
          </p>
        ) : (
          <ChipGroup
            id={id}
            label={text.role}
            options={ROLES.map((role) => ({ value: role, label: copy.roles[role] }))}
            value={value.role}
            onChange={pickRole}
            onPaper
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="min-w-0">
          <p className="text-small font-medium text-ink">{text.passportAccess}</p>
          {sales ? <p className="text-caption text-mute">{text.salesNoPassports}</p> : null}
        </div>
        {sales ? null : <Switch checked={value.passportAccess} onChange={(passportAccess) => onChange({ ...value, passportAccess })} label={text.passportAccess} />}
      </div>
    </>
  );
}

interface Draft extends AccessInput {
  email: string;
  name: string;
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
      { email, name, role: draft.role, passportAccess: draft.role !== "sales" && draft.passportAccess },
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
        <AccessFields id="invite-role" value={draft} onChange={(access) => setDraft({ ...draft, ...access })} />
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

/** Whose access the edit form changes: someone with an account, or a pending invite. */
export interface AccessTarget extends AccessInput {
  id: string;
  /** Their name, or the invite's email. */
  name: string;
  /** The signed-in admin's own row: the role is shown, not changed. */
  self: boolean;
}

/** Changes someone's role and passport access, or a pending invite's. Opens with `target`, closes on save. */
export function AccessSheet({ target, onClose }: { target: AccessTarget | null; onClose: () => void }) {
  const { usersCopy: copy } = useCopy();
  return (
    <Sheet open={target !== null} onClose={onClose} title={target ? copy.edit.title(target.name) : ""} description={copy.edit.body}>
      {/* Keyed by the person, so the form starts from their current access each time it opens. */}
      {target ? <AccessForm key={target.id} target={target} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AccessForm({ target, onClose }: { target: AccessTarget; onClose: () => void }) {
  const { usersCopy: copy, uiCopy } = useCopy();
  const text = copy.edit;
  const change = useChangeAccess();
  const toast = useToast();
  const [draft, setDraft] = useState<AccessInput>({ role: target.role, passportAccess: target.passportAccess });
  const [problem, setProblem] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.role === target.role && draft.passportAccess === target.passportAccess) {
      onClose();
      return;
    }
    setProblem("");
    change.mutate(
      { userId: target.id, input: draft },
      {
        onSuccess: () => {
          toast.show({ message: text.saved(target.name) });
          onClose();
        },
        onError: (error) => setProblem(error instanceof ApiError && error.code === "LAST_ADMIN" ? text.lastAdmin : text.failed),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
      <AccessFields id={`access-role-${target.id}`} value={draft} onChange={setDraft} roleLocked={target.self} />
      <p role="status" className="min-h-5 text-small text-status-warning">
        {problem}
      </p>
      <div className="flex gap-2.5">
        <Button type="submit" disabled={change.isPending} className="flex-1 lg:flex-none">
          {text.save}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1 lg:flex-none">
          {uiCopy.cancel}
        </Button>
      </div>
    </form>
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
        title={invite ? text.inviteTitle(name) : text.title(name)}
        description={invite ? text.inviteBody : text.body}
        confirmLabel={invite ? text.cancelInvite : text.confirm}
        pending={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </>
  );
}
