import { createContext, useContext } from "react";

/** True inside a page the desktop reel only spins past: only its top is ever seen, so it may draw less. */
export const PassingContext = createContext(false);

export function usePassing(): boolean {
  return useContext(PassingContext);
}
