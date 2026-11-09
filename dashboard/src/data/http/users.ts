import type { ImportsService, UsersService } from "../services";
import type { AuditEntry, CopyRun, MondayCopy, PermissionMatrix, SecuritySettings, UserAccount, UserDirectory, UserInvite } from "../types";
import { dashboardApi, segment } from "./api";
import type { ApiClient } from "./client";

/** The team, invites, the role table, the security switches and the log. Admins get emails and invites; everyone gets names. */
export function createHttpUsersService(api: ApiClient): UsersService {
  const http = dashboardApi(api);
  return {
    list: () => http.get<UserDirectory>("/users"),
    updateProfile: ({ name, whatsappPhone }) => http.post<UserAccount>("/users/me", { name, whatsappPhone }),
    permissions: () => http.get<PermissionMatrix>("/users/permissions"),
    changePermission: (change) => http.post<PermissionMatrix>("/users/permissions", change),
    changeAccess: (userId, { role, passportAccess }) =>
      http.post<UserDirectory>(`/users/${segment(userId)}/access`, { role, passportAccess }, "User", userId),
    changeSignIn: (userId, { username, password }) =>
      http.post<UserDirectory>(`/users/${segment(userId)}/sign-in`, { username, password }, "User", userId),
    changeOwnPassword: async ({ current, next }) => {
      await http.post<null>("/users/me/password", { current, next });
    },
    security: () => http.get<SecuritySettings>("/users/security"),
    updateSecurity: (setting, enabled) => http.post<SecuritySettings>("/users/security", { setting, enabled }),
    audit: () => http.get<AuditEntry[]>("/users/audit"),
    invite: (input) => http.post<{ invite: UserInvite; emailed: boolean }>("/users/invites", input),
    remove: async (userId) => {
      await http.post<null>(`/users/${segment(userId)}/remove`, {}, "User", userId);
    },
  };
}

/** The copy from Monday: how it stands, and "copy now" for admins. */
export function createHttpImportsService(api: ApiClient): ImportsService {
  const http = dashboardApi(api);
  return {
    latest: () => http.get<MondayCopy>("/imports/latest"),
    copyNow: () => http.post<CopyRun>("/imports/run"),
  };
}
