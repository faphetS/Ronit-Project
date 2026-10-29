import { NotFoundError, type UsersService } from "../services";
import { latestFirst, type MockContext } from "./context";

export function createUsersMock({ state, respond, actingUserId, logAudit }: MockContext): UsersService {
  return {
    list: () => respond("users", () => ({ users: state.users, invites: state.invites })),
    updateProfile: (patch) =>
      respond("users", () => {
        const user = state.users.find((member) => member.id === actingUserId());
        if (!user) throw new NotFoundError("User", actingUserId());
        if (patch.name !== undefined) {
          user.name = patch.name;
          user.initial = patch.name.charAt(0);
        }
        if (patch.email !== undefined) user.email = patch.email;
        return user;
      }),
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
