import { useSyncExternalStore } from "react";

export type ShellKind = "desktop" | "phone";

/** The same breakpoint as Tailwind's lg (64rem). */
export const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Which shell to show: the desktop rail and menu from 1024px, the phone tab bar below. */
export function useShell(): ShellKind {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(DESKTOP_QUERY).matches ? "desktop" : "phone"),
    () => "desktop",
  );
}
