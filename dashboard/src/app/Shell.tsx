import { DesktopShell } from "./desktop/DesktopShell";
import { PhoneShell } from "./phone/PhoneShell";
import { useWarmSections } from "./prefetch";
import { useShell } from "./useShell";

/** The desktop shell from 1024px, the phone shell below. Both open sections from data loaded ahead. */
export function Shell() {
  useWarmSections();
  return useShell() === "desktop" ? <DesktopShell /> : <PhoneShell />;
}
