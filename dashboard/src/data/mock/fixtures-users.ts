import type { AuditEntry, PermissionMatrix, SecuritySettings, UserInvite } from "../types";
import { HANUKKAH_CAMPAIGN_ID } from "./fixtures-greetings";

// Users and access, as on the Users board. The staff themselves are USERS in fixtures.ts. Times are UTC.

export const INVITES: UserInvite[] = [
  { id: "inv-sales", email: "sales@ronitbarash.site", role: "sales", passportAccess: false, sentAt: "2026-10-27T08:00:00.000Z", sentByUserId: "u-ronit" },
];

export const PERMISSIONS: PermissionMatrix = [
  { area: "leads", access: { admin: "full", office: "full", sales: "full" } },
  { area: "customers", access: { admin: "full", office: "full", sales: "view" } },
  { area: "passports", access: { admin: "full", office: "full", sales: "none" } },
  { area: "greetings", access: { admin: "full", office: "full", sales: "none" } },
  { area: "import", access: { admin: "full", office: "none", sales: "none" } },
  { area: "users", access: { admin: "full", office: "none", sales: "none" } },
];

export const SECURITY: SecuritySettings = {
  twoStepRequired: true,
  maskPassportNumbers: true,
  autoSignOut: true,
  passportAccessLog: true,
  autoSignOutMinutes: 30,
};

/** The sensitive-actions log, and שרה כהן's passport views on her profile. */
export const AUDIT: AuditEntry[] = [
  { id: "au-sara-view-shira", at: "2026-10-28T13:02:00.000Z", byUserId: "u-shira", action: "passport-view", customerId: "c-sara-cohen", customerName: "שרה כהן" },
  { id: "au-hanukkah-edit", at: "2026-10-28T07:15:00.000Z", byUserId: "u-ronit", action: "greeting-edit", campaignId: HANUKKAH_CAMPAIGN_ID, holiday: "hanukkah" },
  { id: "au-moran-device", at: "2026-10-27T16:03:00.000Z", byUserId: "u-moran", action: "new-device-sign-in" },
  { id: "au-moran-role", at: "2026-10-20T08:00:00.000Z", byUserId: "u-ronit", action: "role-change", userId: "u-moran", userName: "מורן", role: "sales" },
  { id: "au-sara-view-ronit", at: "2026-10-03T08:20:00.000Z", byUserId: "u-ronit", action: "passport-view", customerId: "c-sara-cohen", customerName: "שרה כהן" },
];
