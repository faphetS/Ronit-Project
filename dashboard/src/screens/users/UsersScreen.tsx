import { useShell } from "../../app/useShell";
import { UsersDesktop } from "./UsersDesktop";
import { UsersPhone } from "./UsersPhone";

/** Users and access on desktop; the account and admin screen on phones. */
export function UsersScreen() {
  return useShell() === "phone" ? <UsersPhone /> : <UsersDesktop />;
}
