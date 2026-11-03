import type { ReelSection } from "../motion/SectionReel";
import { DesktopShell } from "./desktop/DesktopShell";
import { PhoneShell } from "./phone/PhoneShell";
import { useWarmSections } from "./prefetch";
import { useShell } from "./useShell";

/**
 * The desktop shell from 1024px, the phone shell below. Both open sections from data loaded ahead. `sections` are
 * the sections' main pages, which the desktop reel shows as it spins past.
 */
export function Shell({ sections }: { sections?: readonly ReelSection[] }) {
  useWarmSections();
  return useShell() === "desktop" ? <DesktopShell sections={sections} /> : <PhoneShell />;
}
