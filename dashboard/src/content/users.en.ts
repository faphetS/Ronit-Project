import type { usersCopy as he } from "./users.he";
import type { Widen } from "./types";

export const usersCopy: Widen<typeof he> = {};
