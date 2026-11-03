import type { Variants } from "motion/react";
import { STAGGER_SECONDS, fadeOut, springs } from "./springs";
import type { ScreenTransition } from "./transitions";

/** Lets children with cardVariants settle in one after another. */
export const staggerVariants: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: STAGGER_SECONDS } },
};

/** Cards settle in under a parent that animates from "initial" to "enter". */
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: springs.surface },
};

/** A phone screen transition, plus the reading direction that decides which side "forward" comes from. */
export interface ScreenMotion extends ScreenTransition {
  rtl: boolean;
}

/**
 * Phone screens: fade between tabs; push and pop detail screens. A pushed screen comes in from
 * the end side: from the left in Hebrew, from the right in English.
 */
export const screenVariants: Variants = {
  initial: ({ kind, direction, rtl }: ScreenMotion) => {
    if (kind === "fade") return { opacity: 0, y: 12 };
    const side = rtl ? -1 : 1;
    return direction === "forward" ? { x: `${100 * side}%`, opacity: 1 } : { x: `${-30 * side}%`, opacity: 0.6 };
  },
  enter: ({ kind }: ScreenMotion) =>
    kind === "fade" ? { opacity: 1, y: 0, transition: springs.surface } : { x: 0, opacity: 1, transition: springs.surface },
  exit: ({ kind, direction, rtl }: ScreenMotion) => {
    if (kind === "fade") return { opacity: 0, transition: fadeOut };
    const side = rtl ? -1 : 1;
    return direction === "forward"
      ? { x: `${-30 * side}%`, opacity: 0.6, transition: springs.surface }
      : { x: `${100 * side}%`, opacity: 1, transition: springs.surface };
  },
};
