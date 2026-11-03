import { createContext, useContext, useState } from "react";

/**
 * Whether a page's content builds up as it opens: cards settling in one after another, numbers counting up from zero,
 * bars growing. Only the visit's first page does. The pages opened after it already have their data (app/prefetch.ts),
 * so their content stands as it is instead of looking like it loads again.
 */
export const EntranceContext = createContext(true);

export function useEntrance(): boolean {
  return useContext(EntranceContext);
}

/** True while an outlet is still on the visit's first page (paths with the same key are one page), then false for good. */
export function useFirstPage(key: string): boolean {
  const [first, setFirst] = useState<string | null>(key);
  if (first !== null && first !== key) setFirst(null);
  return first === key;
}
