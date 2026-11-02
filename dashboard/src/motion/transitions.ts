export type PushDirection = "forward" | "back";

export interface ScreenTransition {
  kind: "fade" | "push";
  direction: PushDirection;
}

interface ResolveInput {
  from: string | null;
  to: string;
  /** React Router's navigation type: "POP", "PUSH" or "REPLACE". */
  navigationType: string;
  /** True when the navigation was a back button that replaced the entry. */
  backHint: boolean;
  isPushed: (pathname: string) => boolean;
}

/**
 * How the phone shell animates a navigation.
 * Going into a pushed screen pushes forward. Leaving one with browser back (or a back hint) pops back.
 * Everything else, like switching tabs, fades.
 */
export function resolveScreenTransition({ from, to, navigationType, backHint, isPushed }: ResolveInput): ScreenTransition {
  const direction: PushDirection = navigationType === "POP" || backHint ? "back" : "forward";
  if (from === null || from === to) return { kind: "fade", direction };
  if (direction === "forward" && isPushed(to)) return { kind: "push", direction };
  if (direction === "back" && isPushed(from)) return { kind: "push", direction };
  return { kind: "fade", direction };
}
