import type { signIn as he } from "./signIn.he";
import type { Widen } from "./types";

export const signIn: Widen<typeof he> = {
  title: "Sign in",
  email: "Email address",
  submit: "Sign in",
  today: "Today",
  failed: "We couldn’t sign you in. Please try again.",
};
