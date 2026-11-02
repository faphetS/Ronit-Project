import type { Transition } from "motion/react";

/** The only springs in the app (spec section 8). */
export const springs = {
  /** Segmented controls, presses, showing and hiding. */
  ui: { type: "spring", visualDuration: 0.25, bounce: 0.15 },
  /** Pages, cards, panels, sheets. */
  surface: { type: "spring", visualDuration: 0.4, bounce: 0.1 },
  /** Charts, meters, count-ups. */
  gentle: { type: "spring", visualDuration: 0.6, bounce: 0 },
  /** The navigation drop's edge in front: it springs ahead and overshoots a little. */
  liquidLead: { type: "spring", visualDuration: 0.3, bounce: 0.3 },
  /** The edge behind follows slower, so the drop stretches on the way and settles with a wobble. */
  liquidTrail: { type: "spring", visualDuration: 0.5, bounce: 0.2 },
} as const satisfies Record<string, Transition>;

/** Leaving pages fade out fast and do not move. */
export const fadeOut: Transition = { duration: 0.12, ease: [0.22, 1, 0.36, 1] };

export const STAGGER_SECONDS = 0.04;
export const PRESS_SCALE = 0.96;
