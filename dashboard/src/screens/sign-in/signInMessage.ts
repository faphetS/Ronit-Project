import type { Copy } from "../../content/copy";
import { SignInError } from "../../data/services";

/** A refusal in words; anything that isn't a known refusal reads as "couldn't sign in". */
export function signInMessage(copy: Copy["signIn"], error: unknown): string {
  return error instanceof SignInError ? copy.errors[error.code] : copy.failed;
}
