import type { greetingsCopy as he } from "./greetings.he";
import type { Widen } from "./types";

export const greetingsCopy: Widen<typeof he> = {};
