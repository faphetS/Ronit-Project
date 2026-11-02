import type { states as he } from "./states.he";
import type { Widen } from "./types";

export const states: Widen<typeof he> = {
  loading: "Loading…",
  error: "Something went wrong while loading.",
  retry: "Try again",
};
