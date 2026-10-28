import { DesktopShell } from "./desktop/DesktopShell";
import { PhoneShell } from "./phone/PhoneShell";
import { useShell } from "./useShell";

/** The desktop shell from 1024px, the phone shell below. */
export function Shell() {
  return useShell() === "desktop" ? <DesktopShell /> : <PhoneShell />;
}
