import { useState, type FormEvent } from "react";
import { useCopy } from "../../content/locale";
import { useChangeAccess, useChangeSignIn, useInviteUser, useRemoveUser } from "../../data/queries";
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
import { PASSWORD_MIN } from "./OwnPasswordForm";
import { ROLES } from "./users-format";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** As the server checks it: a Latin letter, then 2 to 31 Latin letters, digits, dots, dashes or underscores. */
const USERNAME = /^[a-z][a-z0-9._-]{2,31}$/;

/** What's wrong with a username or password the office typed, in words; "" when nothing is. Both may be left empty. */
function signInProblem(username: string, password: string, text: { usernameRule: string; passwordShort: string }): string {
  if (username && !USERNAME.test(username)) return text.usernameRule;
  if (password && [...password].length < PASSWORD_MIN) return text.passwordShort;
  return "";
}

/** The server's refusals about usernames and passwords, in words; null for anything else. */
function signInRefusal(error: unknown, text: { usernameRule: string; usernameTaken: string; passwordShort: string }): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "USERNAME_TAKEN") return text.usernameTaken;
  if (error.code === "INVALID_USERNAME") return text.usernameRule;
  if (error.code === "WEAK_PASSWORD") return text.passwordShort;
  return null;
}

interface SignInFieldsProps {
  username: string;
  password: string;
  onChange: (value: { username: string; password: string }) => void;
  usernameLabel: string;
  passwordLabel: string;
}

/**
 * The username and a password for someone else. The password shows as typed: the office passes it on by hand, and
 * a browser shouldn't offer to save it as the admin's own.
 */
function SignInFields({ username, password, onChange, usernameLabel, passwordLabel }: SignInFieldsProps) {
  return (
    <>
      <Field
        label={usernameLabel}
        icon="user"
        name="username"
        autoComplete="off"
        dir="ltr"
        spellCheck={false}
        onPaper
        value={username}
        onChange={(value) => onChange({ username: value, password })}
      />
      <Field
        label={passwordLabel}
        icon="key"
        name="new-user-password"
        autoComplete="off"
        dir="ltr"
        spellCheck={false}
        onPaper
        value={password}
        onChange={(value) => onChange({ username, password: value })}
      />
    </>
  );
}

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
  username: string;
  password: string;
}

const EMPTY: Draft = { email: "", name: "", role: "office", passportAccess: false, username: "", password: "" };

/**
 * Gives someone an account: their email (for the invite, the sign-in codes and Google), name, role and passport
 * access, and if the office likes, a username and a first password. The server emails the invite, without the
 * password; sales never get passport access.
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
    const username = draft.username.trim().toLowerCase();
    const { password } = draft;
    if (!name || !EMAIL.test(email)) {
      setProblem(text.invalid);
      return;
    }
    const invalid = signInProblem(username, password, text);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem("");
    invite.mutate(
      {
        email,
        name,
        role: draft.role,
        passportAccess: draft.role !== "sales" && draft.passportAccess,
        username: username || undefined,
        password: password || undefined,
      },
      {
        onSuccess: ({ emailed }) => {
          const sent = password ? text.sentWithPassword(email.toLowerCase()) : text.sent(email.toLowerCase());
          toast.show(emailed ? { message: sent } : { message: text.notEmailed, tone: "warning" });
          close();
        },
        onError: (error) =>
          setProblem(signInRefusal(error, text) ?? (error instanceof ApiError && error.code === "ALREADY_REGISTERED" ? text.exists : text.failed)),
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
        <SignInFields
          username={draft.username}
          password={draft.password}
          onChange={(signIn) => setDraft({ ...draft, ...signIn })}
          usernameLabel={text.username}
          passwordLabel={text.password}
        />
        <p className="-mt-1 px-2 text-caption text-mute">{text.passwordNote}</p>
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
  /** "" when none. */
  username: string;
  hasPassword: boolean;
  /** The signed-in admin's own row: the role is shown, not changed, and there's no removing yourself. */
  self: boolean;
  /** A pending invite: removing it is cancelling the invite. */
  invite: boolean;
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
  const changeSignIn = useChangeSignIn();
  const toast = useToast();
  const [draft, setDraft] = useState<AccessInput>({ role: target.role, passportAccess: target.passportAccess });
  const [signIn, setSignIn] = useState({ username: target.username, password: "" });
  const [problem, setProblem] = useState("");
  const pending = change.isPending || changeSignIn.isPending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = signIn.username.trim().toLowerCase();
    const accessChanged = draft.role !== target.role || draft.passportAccess !== target.passportAccess;
    const usernameChanged = username !== target.username;
    if (!accessChanged && !usernameChanged && !signIn.password) {
      onClose();
      return;
    }
    const invalid = signInProblem(username, signIn.password, copy.inviteForm);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem("");
    try {
      if (accessChanged) await change.mutateAsync({ userId: target.id, input: draft });
      if (usernameChanged || signIn.password) {
        await changeSignIn.mutateAsync({
          userId: target.id,
          change: { username: usernameChanged ? username : undefined, password: signIn.password || undefined },
        });
      }
      toast.show({ message: text.saved(target.name) });
      onClose();
    } catch (error) {
      setProblem(signInRefusal(error, copy.inviteForm) ?? (error instanceof ApiError && error.code === "LAST_ADMIN" ? text.lastAdmin : text.failed));
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3.5">
      <AccessFields id={`access-role-${target.id}`} value={draft} onChange={setDraft} roleLocked={target.self} />
      <div className="flex flex-col gap-2">
        <p className="text-small font-medium text-ink">{text.signIn}</p>
        <SignInFields
          username={signIn.username}
          password={signIn.password}
          onChange={setSignIn}
          usernameLabel={text.username}
          passwordLabel={text.newPassword(target.hasPassword)}
        />
        <p className="px-2 text-caption text-mute">{target.self ? text.passwordNoteSelf : text.passwordNote(target.name)}</p>
      </div>
      <p role="status" className="min-h-5 text-small text-status-warning">
        {problem}
      </p>
      <div className="flex gap-2.5">
        <Button type="submit" disabled={pending} className="flex-1 lg:flex-none">
          {text.save}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1 lg:flex-none">
          {uiCopy.cancel}
        </Button>
      </div>
      {target.self ? null : (
        <div className="mt-2 border-t border-ink/8 pt-4">
          <RemoveUserButton userId={target.id} name={target.name} invite={target.invite} onRemoved={onClose} />
        </div>
      )}
    </form>
  );
}

interface RemoveUserProps {
  userId: string;
  /** The person's name, or the invite's email. */
  name: string;
  invite: boolean;
  /** After the account is closed, like closing the sheet it was in. */
  onRemoved?: () => void;
}

/** "הסרה" at the bottom of a person's sheet: asks first, then closes the account and signs them out everywhere. */
export function RemoveUserButton({ userId, name, invite, onRemoved }: RemoveUserProps) {
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
        onRemoved?.();
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
