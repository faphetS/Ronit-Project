import type { Transition } from "motion/react";

/** The only springs in the app (spec section 8). */
export const springs = {
  /** Menu pill, tab highlight, segmented controls, presses. */
  ui: { type: "spring", visualDuration: 0.25, bounce: 0.15 },
  /** Pages, cards, panels, sheets. */
  surface: { type: "spring", visualDuration: 0.4, bounce: 0.1 },
  /** Charts, meters, count-ups. */
  gentle: { type: "spring", visualDuration: 0.6, bounce: 0 },
} as const satisfies Record<string, Transition>;

/** Leaving pages fade out fast and do not move. */
export const fadeOut: Transition = { duration: 0.12, ease: [0.22, 1, 0.36, 1] };

export const STAGGER_SECONDS = 0.04;
export const PRESS_SCALE = 0.96;
