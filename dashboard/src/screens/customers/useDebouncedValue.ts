import { useEffect, useState } from "react";

/** `value`, once it has stopped changing for `delay` ms. Used for the phone search, so each keystroke does not query. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
