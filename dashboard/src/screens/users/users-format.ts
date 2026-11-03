import type { Copy, Locale } from "../../content/copy";
import type { AuditEntry, CopyStatus, Role, SecuritySettings, SecuritySwitch, UserAccount, UserDirectory, UserInvite } from "../../data/types";
import { daysBetween } from "../../lib/clock";
import { formatDayMonth, formatTime } from "../../lib/format";
import type { StatusTone } from "../../ui/StatusTag";

type UsersCopy = Copy["usersCopy"];

/** The permission matrix's columns, in the board's order. */
export const ROLES: readonly Role[] = ["admin", "office", "sales"];

/** The dot beside the copy's status on the phone's admin links. */
export const IMPORT_TONE: Record<CopyStatus, StatusTone> = { running: "new", completed: "registered", failed: "warning", skipped: "warning" };

/** The sensitive-actions card shows the latest few, as on the board. */
export const RECENT_ACTIONS = 4;

/** The phone board leaves the access-log switch to the desktop. */
export const PHONE_SWITCHES: readonly SecuritySwitch[] = ["twoStepRequired", "maskPassportNumbers", "autoSignOut"];

/** A row of the users table: someone with an account, or an invite nobody accepted yet. */
export type DirectoryRow = { kind: "user"; id: string; user: UserAccount } | { kind: "invite"; id: string; invite: UserInvite };

/** Accounts first, then the pending invites. */
export function directoryRows({ users, invites }: UserDirectory): DirectoryRow[] {
  return [
    ...users.map((user): DirectoryRow => ({ kind: "user", id: user.id, user })),
    ...invites.map((invite): DirectoryRow => ({ kind: "invite", id: invite.id, invite })),
  ];
}

/** A sign-in or an action as the board writes it: "היום 15:02", "אתמול 18:03", or the date, "20.10". */
export function formatWhen(at: string, reference: Date, locale: Locale, copy: UsersCopy): string {
  const date = new Date(at);
  const days = daysBetween(date, reference);
  if (days === 0) return copy.today(formatTime(date));
  if (days === 1) return copy.yesterday(formatTime(date));
  return formatDayMonth(date, locale);
}

/** The log names staff by first name: "רונית", not "רונית ברש". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}

/** One line per action, naming the customer, greeting, person, permission or setting it touched. */
export function auditTitle(entry: AuditEntry, usersCopy: UsersCopy, holidayNames: Copy["holidayNames"]): string {
  const { audit: copy, roles, permissions } = usersCopy;
  switch (entry.action) {
    case "passport-view":
      return copy.passportView(entry.customerName);
    case "passport-photo-view":
      return copy.passportPhotoView(entry.customerName);
    case "passport-received":
      return copy.passportReceived(entry.customerName, copy.via[entry.via]);
    case "greeting-edit":
      return copy.greetingEdit(holidayNames[entry.holiday]);
    case "greeting-approve":
      return copy.greetingApprove(holidayNames[entry.holiday]);
    case "new-device-sign-in":
      return copy.newDevice;
    case "sign-in-locked":
      return copy.signInLocked;
    case "sign-in-refused":
      return copy.signInRefused(entry.email);
    case "staff-invited":
      return copy.staffInvited(entry.userName);
    case "staff-removed":
      return copy.staffRemoved(entry.userName);
    case "staff-access-changed":
      return copy.staffAccessChanged(entry.userName, roles[entry.role], entry.passportAccess);
    case "permission-change":
      return copy.permissionChange(roles[entry.role], permissions.areas[entry.area], permissions.access[entry.access]);
    case "security-change":
      return copy.securityChange(copy.settings[entry.setting], entry.enabled);
    case "monday-copy":
      return copy.mondayCopy;
  }
}

/** Who did it, by first name; "המערכת" for automatic actions; null while the users are unknown. */
export function auditWho(entry: AuditEntry, users: readonly UserAccount[] | undefined, copy: UsersCopy["audit"]): string | null {
  if (entry.byUserId === null) return copy.system;
  const user = users?.find((candidate) => candidate.id === entry.byUserId);
  return user ? firstName(user.name) : null;
}

/** The words beside a security switch. On phones the two-step line is shorter, as on the board. */
export function switchLabel(key: SecuritySwitch, settings: SecuritySettings, copy: UsersCopy["security"], short = false): string {
  switch (key) {
    case "twoStepRequired":
      return short ? copy.twoStepRequiredShort : copy.twoStepRequired;
    case "maskPassportNumbers":
      return copy.maskPassportNumbers;
    case "autoSignOut":
      return copy.autoSignOut(settings.autoSignOutMinutes);
    case "passportAccessLog":
      return copy.passportAccessLog;
  }
}
