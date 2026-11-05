import type { Transition } from "motion/react";

/** The only springs in the app (spec section 8). */
export const springs = {
  /** Segmented controls, presses, showing and hiding. */
  ui: { type: "spring", visualDuration: 0.25, bounce: 0.15 },
  /** Pages, cards, panels, sheets. */
  surface: { type: "spring", visualDuration: 0.4, bounce: 0.1 },
  /** Charts, meters, count-ups. */
  gentle: { type: "spring", visualDuration: 0.6, bounce: 0 },
  /** A page's content as it opens: Miyo's soft rise, as a spring with no bounce. */
  settle: { type: "spring", visualDuration: 0.32, bounce: 0 },
  /** The navigation drop's edge in front: it springs ahead and overshoots a little. */
  liquidLead: { type: "spring", visualDuration: 0.3, bounce: 0.3 },
  /** The edge behind follows slower, so the drop stretches on the way and settles with a wobble. */
  liquidTrail: { type: "spring", visualDuration: 0.5, bounce: 0.2 },
} as const satisfies Record<string, Transition>;

/** Leaving pages fade out fast and do not move. */
export const fadeOut: Transition = { duration: 0.12, ease: [0.22, 1, 0.36, 1] };

export const STAGGER_SECONDS = 0.04;
export const PRESS_SCALE = 0.96;
/** Cards and rows give a little less than buttons when pressed. */
export const CARD_PRESS_SCALE = 0.98;
/** How far content rises as a page settles, in px. */
export const SETTLE_RISE = 8;
/** How far the month calendars slide, in px. */
export const SLIDE_DISTANCE = 16;
/** Rows cascade: the first starts at `first` s, each next one `step` s later, none later than `last`. */
export const CASCADE = { first: 0.08, step: 0.036, last: 0.5 } as const;
/** The reel lets the arriving page's content settle this long before it stops, in ms. */
export const SETTLE_LEAD_MS = 150;
