import type { UsersService } from "../services";
import { latestFirst, type MockContext } from "./context";

export function createUsersMock({ state, respond, logAudit }: MockContext): UsersService {
  return {
    list: () => respond("users", () => ({ users: state.users, invites: state.invites })),
    permissions: () => respond("users", () => state.permissions),
    security: () => respond("users", () => state.security),
    updateSecurity: (key, enabled) =>
      respond("users", () => {
        if (state.security[key] !== enabled) {
          state.security[key] = enabled;
          logAudit({ action: "security-change", setting: key, enabled });
        }
        return state.security;
      }),
    audit: () => respond("users", () => latestFirst(state.audit.filter((entry) => entry.byUserId !== null))),
  };
}
