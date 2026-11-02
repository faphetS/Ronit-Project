import { createContext, useContext } from "react";
import { useLocation } from "react-router";

/** The path of the screen a component belongs to. A leaving screen keeps its own path while it animates out. */
export const ScreenPathContext = createContext<string | null>(null);

/** The current screen's path: pinned inside the outlets, the live location anywhere else. */
export function useScreenPath(): string {
  const pinned = useContext(ScreenPathContext);
  const location = useLocation();
  return pinned ?? location.pathname;
}
