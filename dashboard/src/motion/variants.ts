import type { Variants } from "motion/react";
import { STAGGER_SECONDS, fadeOut, springs } from "./springs";
import type { ScreenTransition } from "./transitions";

/** Desktop page change: the new page rises in, the old one fades out fast. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0, transition: { ...springs.surface, staggerChildren: STAGGER_SECONDS } },
  exit: { opacity: 0, transition: fadeOut },
};

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

/** Phone screens: fade between tabs; push and pop detail screens (RTL: forward enters from the left). */
export const screenVariants: Variants = {
  initial: ({ kind, direction }: ScreenTransition) => {
    if (kind === "fade") return { opacity: 0, y: 12 };
    return direction === "forward" ? { x: "-100%", opacity: 1 } : { x: "30%", opacity: 0.6 };
  },
  enter: ({ kind }: ScreenTransition) =>
    kind === "fade" ? { opacity: 1, y: 0, transition: springs.surface } : { x: 0, opacity: 1, transition: springs.surface },
  exit: ({ kind, direction }: ScreenTransition) => {
    if (kind === "fade") return { opacity: 0, transition: fadeOut };
    return direction === "forward"
      ? { x: "30%", opacity: 0.6, transition: springs.surface }
      : { x: "-100%", opacity: 1, transition: springs.surface };
  },
};
