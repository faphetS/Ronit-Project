import { useState } from "react";
import { useNavigate } from "react-router";
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useCopy, useLocale } from "../../content/locale";
import { useCan, useImportRun, useSession, useSignOut, useUsers } from "../../data/queries";
import { now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth } from "../../lib/format";
import { Avatar } from "../../ui/Avatar";
import { Icon } from "../../ui/Icon";
import { IconCircle } from "../../ui/IconCircle";
import { ListRow } from "../../ui/ListRow";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { Sheet } from "../../ui/Sheet";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { useToast } from "../../ui/toast-context";
import { AccessSheet, InviteSheet, type AccessTarget } from "./InviteSheet";
import { LoadingRows } from "./LoadingRows";
import { OwnPasswordForm } from "./OwnPasswordForm";
import { SecurityCard } from "./SecurityCard";
import { formatWhen, IMPORT_TONE } from "./users-format";

/** The black "+" at the end of the top bar, for admins: the invite form. */
function InviteButton({ label, className }: { label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const admin = useCan("users", "full");
  if (!admin) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} className={cx("grid size-12 place-items-center rounded-full bg-ink text-cream", className)}>
        <Icon name="plus" />
      </button>
      <InviteSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Ronit's own card: her name, her role and her passport access. */
function AccountCard() {
  const { usersCopy: copy } = useCopy();
  const session = useSession();
  const user = session.data?.user;

  return (
    <Surface variant="glass" compact aria-label={copy.account.label} className="flex items-center gap-3.5">
      {user ? (
        <>
          <Avatar initial={user.initial} gold size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-display-3 font-light text-ink">
              {user.name}{" "}
              <br />
              <span className="text-[24px] text-faint">{copy.roles[user.role]}</span>
            </h1>
            <p className="mt-1 text-caption text-mute">{user.passportAccess ? copy.account.passportsFull : copy.account.passportsNone}</p>
          </div>
        </>
      ) : session.isError ? (
        <div className="flex-1">
          <ErrorState onRetry={() => void session.refetch()} />
        </div>
      ) : (
        <LoadingRows shape="account" />
      )}
    </Surface>
  );
}

/** The import, your password, the message history and signing out. */
function AdminLinks() {
  const { usersCopy: copy, nav } = useCopy();
  const run = useImportRun();
  const signOut = useSignOut();
  const session = useSession();
  const directory = useUsers();
  const navigate = useNavigate();
  const toast = useToast();
  const [changingPassword, setChangingPassword] = useState(false);
  const status = run.data?.lastRun?.status;
  const me = directory.data?.users.find((user) => user.id === session.data?.user.id);

  const leave = () =>
    signOut.mutate(undefined, {
      onSuccess: () => navigate("/login", { replace: true }),
      onError: () => toast.show({ message: copy.account.signOutFailed, tone: "warning" }),
    });

  return (
    <Surface variant="card" compact aria-label={copy.account.admin} className="px-4 py-1.5">
      <ul>
        <ListRow
          as="li"
          to="/import"
          leading={<IconCircle icon="import" />}
          title={copy.account.import}
          trailing={
            status ? (
              <StatusTag tone={IMPORT_TONE[status]}>{copy.account.importStatus[status]}</StatusTag>
            ) : run.isPending ? (
              <Skeleton className="h-7 w-16 shrink-0" />
            ) : null
          }
        />
        {/* Only a password the office set can be changed here; without one, the row just says so. */}
        {me ? (
          <ListRow
            as="li"
            onClick={me.hasPassword ? () => setChangingPassword(true) : undefined}
            leading={<IconCircle icon="key" />}
            title={copy.account.password}
            description={me.hasPassword ? nav.accountMenu.passwordSet : nav.accountMenu.passwordNotSet}
            chevron={me.hasPassword}
          />
        ) : null}
        <ListRow as="li" to="/greetings/holidays#history" leading={<IconCircle icon="history" />} title={copy.account.history} chevron />
        <ListRow as="li" onClick={leave} leading={<IconCircle icon="signOut" />} title={copy.account.signOut} />
      </ul>
      <Sheet open={changingPassword} onClose={() => setChangingPassword(false)} title={copy.password.title}>
        {changingPassword ? <OwnPasswordForm onPaper onDone={() => setChangingPassword(false)} /> : null}
      </Sheet>
    </Surface>
  );
}

/** The others on the team, then the pending invites. Ronit is on her own card above. Admins tap someone to change their access. */
function TeamCard() {
  const { usersCopy: copy } = useCopy();
  const { locale } = useLocale();
  const directory = useUsers();
  const session = useSession();
  const admin = useCan("users", "full");
  const [editing, setEditing] = useState<AccessTarget | null>(null);
  const meId = session.data?.user.id;
  const data = directory.data;
  const reference = now();
  const others = data ? data.users.filter((user) => user.id !== meId) : [];
  const edit = (target: AccessTarget) => (admin ? () => setEditing(target) : undefined);

  return (
    <Surface variant="card" compact aria-label={copy.users.title} className="px-4 pt-4 pb-1.5">
      <SectionHeader title={copy.users.title} trailing={data ? copy.activeCount(data.users.length) : undefined} flush className="mb-1" />
      {data ? (
        others.length + data.invites.length > 0 ? (
          <ul>
            {others.map((user) => (
              <ListRow
                key={user.id}
                as="li"
                onClick={edit({
                  id: user.id,
                  name: user.name,
                  role: user.role,
                  passportAccess: user.passportAccess,
                  username: user.username,
                  hasPassword: user.hasPassword,
                  self: false,
                  invite: false,
                })}
                leading={<Avatar initial={user.initial} />}
                title={user.name}
                description={copy.account.personLine(
                  copy.roles[user.role],
                  user.lastSignInAt ? formatWhen(user.lastSignInAt, reference, locale, copy) : copy.users.neverSignedIn,
                )}
                trailing={
                  user.passportAccess ? (
                    <StatusTag tone="registered">{copy.account.passportsTag}</StatusTag>
                  ) : (
                    <StatusTag tone="irrelevant">{copy.account.noPassportsTag}</StatusTag>
                  )
                }
              />
            ))}
            {data.invites.map((invite) => (
              <ListRow
                key={invite.id}
                as="li"
                onClick={edit({
                  id: invite.id,
                  name: invite.email,
                  role: invite.role,
                  passportAccess: invite.passportAccess,
                  username: invite.username,
                  hasPassword: invite.hasPassword,
                  self: false,
                  invite: true,
                })}
                leading={<Avatar initial={copy.users.inviteInitial} tone="outline" />}
                title={copy.users.pendingInvite}
                titleTone="muted"
                description={copy.account.inviteLine(copy.roles[invite.role], formatDayMonth(new Date(invite.sentAt), locale))}
              />
            ))}
          </ul>
        ) : (
          <EmptyState message={copy.account.noOthers} />
        )
      ) : directory.isError ? (
        <ErrorState onRetry={() => void directory.refetch()} />
      ) : (
        <LoadingRows shape="person" count={3} />
      )}
      <AccessSheet target={editing} onClose={() => setEditing(null)} />
    </Surface>
  );
}

/** On phones /users is the account and admin screen: Ronit's card, the admin links, the team and the security switches. */
export function UsersPhone() {
  const { usersCopy: copy } = useCopy();
  return (
    <ScreenFrame>
      {/* The top bar keeps an empty slot at its end on pushed screens; the invite button sits in it. */}
      <div className="relative">
        <PhoneTopBar title={copy.account.title} />
        <InviteButton label={copy.invite} className="absolute end-0 top-1/2 -translate-y-1/2" />
      </div>
      <AccountCard />
      <AdminLinks />
      <TeamCard />
      <SecurityCard phone />
    </ScreenFrame>
  );
}
