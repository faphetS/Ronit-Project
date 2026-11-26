import { cx } from "../../lib/cx";

/** A row or button that answers a press: sand under the pointer and the keyboard's focus, a shade darker while pressed. */
export const PRESSABLE = "transition-colors hover:bg-sand-light active:bg-line focus-visible:bg-sand-light focus-visible:outline-none";
export const HAIRLINE = "border-t border-line";
/** A settings row that is itself the press: a link or a button. */
export const ROW = cx("flex w-full items-center gap-3 ps-3", PRESSABLE);
/** A settings row that holds its own control, like a switch. */
export const STILL_ROW = "flex w-full items-center gap-3 ps-3";
