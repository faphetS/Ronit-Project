import { useCopy, useLocale } from "../../content/locale";
import { useAuditLog, usePermissions, useSession, useUsers } from "../../data/queries";
import type { AccessLevel, PermissionRow } from "../../data/types";
import { now } from "../../lib/clock";
import { formatDayMonth } from "../../lib/format";
import { DataTable, type DataColumn } from "../../ui/DataTable";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { IconCircle } from "../../ui/IconCircle";
import { PersonCell } from "../../ui/PersonCell";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { Timeline, type TimelineEntry } from "../../ui/Timeline";
import { LoadingRows } from "./LoadingRows";
import { SecurityCard } from "./SecurityCard";
import { auditTitle, auditWho, directoryRows, formatWhen, RECENT_ACTIONS, ROLES, type DirectoryRow } from "./users-format";

/** Everyone with an account, then the invites nobody accepted yet. */
function UsersTableCard({ className }: { className?: string }) {
  const { usersCopy: copy } = useCopy();
  const { locale } = useLocale();
  const directory = useUsers();
  const session = useSession();
  const meId = session.data?.user.id;
  const data = directory.data;
  const table = copy.users;
  const reference = now();

  const columns: DataColumn<DirectoryRow>[] = [
    {
      key: "user",
      header: table.columns.user,
      isRowHeader: true,
      cell: (row) =>
        row.kind === "user" ? (
          <PersonCell name={row.user.name} initial={row.user.initial} gold={row.user.id === meId} />
        ) : (
          <PersonCell name={table.pendingInvite} initial={table.inviteInitial} avatarTone="outline" muted />
        ),
    },
    {
      key: "role",
      header: table.columns.role,
      cell: (row) => copy.roles[row.kind === "user" ? row.user.role : row.invite.role],
    },
    {
      key: "passport",
      header: table.columns.passport,
      cell: (row) =>
        (row.kind === "user" ? row.user.passportAccess : row.invite.passportAccess) ? (
          <StatusTag tone="registered">{table.passportFull}</StatusTag>
        ) : (
          <StatusTag tone="irrelevant">{table.passportNone}</StatusTag>
        ),
    },
    {
      key: "lastSignIn",
      header: table.columns.lastSignIn,
      className: "text-mute",
      cell: (row) => {
        if (row.kind === "invite") return table.inviteSent(formatDayMonth(new Date(row.invite.sentAt), locale));
        return row.user.lastSignInAt ? formatWhen(row.user.lastSignInAt, reference, locale, copy) : table.neverSignedIn;
      },
    },
    {
      key: "twoStep",
      header: table.columns.twoStep,
      cell: (row) =>
        row.kind === "user" ? (
          <StatusTag tone={row.user.twoStep === "active" ? "registered" : "warning"}>{table.twoStep[row.user.twoStep]}</StatusTag>
        ) : (
          <span className="text-mute">
            <span aria-hidden="true">{table.noValue}</span>
            <span className="sr-only">{table.twoStepNotYet}</span>
          </span>
        ),
    },
  ];

  return (
    <Surface variant="card" aria-label={table.title} className={className}>
      <SectionHeader title={table.title} trailing={data ? copy.summary(data.users.length, data.invites.length) : undefined} />
      {data ? (
        <DataTable
          label={table.title}
          columns={columns}
          rows={directoryRows(data)}
          rowKey={(row) => row.id}
          animateRows={false}
          empty={<EmptyState message={table.empty} />}
        />
      ) : directory.isError ? (
        <ErrorState onRetry={() => void directory.refetch()} />
      ) : (
        <LoadingRows shape="person" count={4} />
      )}
    </Surface>
  );
}

/** Full access is a black check, no access an outlined dash, view-only a tag, as on the board. */
function AccessMark({ level }: { level: AccessLevel }) {
  const { usersCopy } = useCopy();
  const label = usersCopy.permissions.access[level];
  if (level === "full") return <IconCircle icon="check" tone="solid" size="sm" label={label} />;
  if (level === "none") return <IconCircle icon="minus" tone="outline" size="sm" label={label} />;
  return <StatusTag tone="irrelevant">{label}</StatusTag>;
}

/** What each role can do in each area. Read only: changing permissions has no service yet. */
function PermissionsCard({ className }: { className?: string }) {
  const { usersCopy: copy } = useCopy();
  const permissions = usePermissions();
  const matrix = copy.permissions;

  const columns: DataColumn<PermissionRow>[] = [
    {
      key: "area",
      header: matrix.area,
      isRowHeader: true,
      cell: (row) => <span className="font-medium text-ink">{matrix.areas[row.area]}</span>,
    },
    ...ROLES.map(
      (role): DataColumn<PermissionRow> => ({
        key: role,
        header: copy.roles[role],
        align: "center",
        cell: (row) => <AccessMark level={row.access[role]} />,
      }),
    ),
  ];

  return (
    <Surface variant="card" aria-label={matrix.title} className={className}>
      <SectionHeader title={matrix.title} trailing={matrix.adminOnly} />
      {permissions.data ? (
        <DataTable
          label={matrix.title}
          columns={columns}
          rows={permissions.data}
          rowKey={(row) => row.area}
          animateRows={false}
          empty={<EmptyState message={matrix.empty} />}
        />
      ) : permissions.isError ? (
        <ErrorState onRetry={() => void permissions.refetch()} />
      ) : (
        <LoadingRows shape="matrix" count={6} />
      )}
    </Surface>
  );
}

/** The latest sensitive actions: who did what, to which customer, greeting, person or setting, and when. */
function AuditCard({ className }: { className?: string }) {
  const { usersCopy: copy, holidayNames } = useCopy();
  const { locale } = useLocale();
  const audit = useAuditLog();
  const directory = useUsers();
  const reference = now();

  const entries = audit.data?.slice(0, RECENT_ACTIONS).map((entry): TimelineEntry => {
    const who = auditWho(entry, directory.data?.users, copy.audit);
    const when = formatWhen(entry.at, reference, locale, copy);
    return { key: entry.id, title: auditTitle(entry, copy.audit, holidayNames), meta: who ? copy.audit.meta(who, when) : when };
  });

  return (
    <Surface variant="glass" aria-label={copy.audit.title} className={className}>
      <SectionHeader surface="glass" title={copy.audit.title} />
      {entries ? (
        entries.length > 0 ? (
          <Timeline entries={entries} surface="glass" />
        ) : (
          <EmptyState message={copy.audit.empty} />
        )
      ) : audit.isError ? (
        <ErrorState onRetry={() => void audit.refetch()} />
      ) : (
        <LoadingRows shape="timeline" count={RECENT_ACTIONS} />
      )}
    </Surface>
  );
}

/** Users and access on desktop: the users table and the security switches, the permission matrix and the access log. */
export function UsersDesktop() {
  const { usersCopy: copy } = useCopy();
  const directory = useUsers();
  const data = directory.data;

  return (
    <ScreenFrame>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <Headline title={copy.title} soft={data ? copy.summary(data.users.length, data.invites.length) : copy.softFallback} size="display" />
        <div className="flex flex-col items-end gap-3.5 pb-1.5">
          <p className="max-w-[360px] text-end text-small text-mute">{copy.note}</p>
          {/* Inviting a user has no service yet. No pointer events, so the circle does not lean on hover. */}
          <GooButton icon="plus" disabled className="pointer-events-none">
            {copy.invite}
          </GooButton>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-5">
        <UsersTableCard className="col-span-7 xl:col-span-8" />
        <SecurityCard phone={false} className="col-span-5 xl:col-span-4" />
        <PermissionsCard className="col-span-7 xl:col-span-8" />
        <AuditCard className="col-span-5 xl:col-span-4" />
      </div>
    </ScreenFrame>
  );
}
