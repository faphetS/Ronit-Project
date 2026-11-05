import { useState } from "react";
import { CASCADE } from "./springs";

/** A row's place in its list, and whether it cascades: only the rows a list showed first do. */
export interface RowMotion {
  index: number;
  cascade: boolean;
}

/** When the i-th row of a list starts to settle, in seconds: never past CASCADE.last, however long the list. */
export function cascadeDelay(index: number): number {
  const delay = Math.min(CASCADE.first + CASCADE.step * Math.max(0, index), CASCADE.last);
  return Math.round(delay * 1000) / 1000;
}

/**
 * The keys a list showed when it first had rows: those cascade in, whether the list opened with its page or after its
 * data arrived. Rows a filter, a search or a refresh adds later rise in together instead, so filtering never cascades.
 */
export function useFirstKeys(keys: readonly string[]): (key: string) => boolean {
  const [first, setFirst] = useState<ReadonlySet<string> | null>(() => (keys.length > 0 ? new Set(keys) : null));
  // React's pattern for reacting to a changed value while rendering: the first time the list has rows.
  if (first === null && keys.length > 0) setFirst(new Set(keys));
  const shown = first ?? new Set(keys);
  return (key) => shown.has(key);
}
