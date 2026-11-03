import type { states as he } from "./states.he";
import type { Widen } from "./types";

export const states: Widen<typeof he> = {
  loading: "Loading…",
  error: "Something went wrong while loading.",
  retry: "Try again",
  noAccessTitle: "You don't have access here",
  noAccess: "Your role doesn't include this part. You can ask an admin to open it for you.",
};
