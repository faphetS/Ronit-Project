import type { Variants } from "motion/react";
import { cascadeDelay, type RowMotion } from "./cascade";
import { SETTLE_RISE, SLIDE_DISTANCE, STAGGER_SECONDS, fadeOut, springs } from "./springs";
import type { ScreenTransition } from "./transitions";

/** Leads cards that settle one after another: "enter" on the visit's first page, "settled" on later ones. */
export const staggerVariants: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: STAGGER_SECONDS } },
  held: {},
  settled: { transition: { staggerChildren: STAGGER_SECONDS } },
};

/** Cards: they build up on the visit's first page (initial → enter) and rise softly on later ones (held → settled). */
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: springs.surface },
  held: { opacity: 0, y: SETTLE_RISE, scale: 1 },
  settled: { opacity: 1, y: 0, scale: 1, transition: springs.settle },
};

/** A page's headline builds up with the first page's cards; on later pages it stands while their cards settle. */
export const headlineVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: springs.surface },
};

function shownRow({ index, cascade }: RowMotion) {
  return { opacity: 1, y: 0, transition: { ...springs.settle, delay: cascade ? cascadeDelay(index) : 0 } };
}

/** Table rows, kanban cards and list rows, with their RowMotion as `custom`: they cascade in and fade out. */
export const rowVariants: Variants = {
  initial: { opacity: 0, y: SETTLE_RISE },
  held: { opacity: 0, y: SETTLE_RISE },
  enter: shownRow,
  settled: shownRow,
  exit: { opacity: 0, transition: fadeOut },
};

/** Where a new month comes in from, in px: in Hebrew "next" comes from the left. 0 when there's no change to show. */
export function slideFrom(direction: -1 | 0 | 1, rtl: boolean): number {
  if (direction === 0) return 0;
  return direction * (rtl ? -1 : 1) * SLIDE_DISTANCE;
}

/** A phone screen transition, plus the reading direction that decides which side "forward" comes from. */
export interface ScreenMotion extends ScreenTransition {
  rtl: boolean;
}

/**
 * Phone screens: fade between tabs (the content inside rises as it settles); push and pop detail screens. A pushed
 * screen comes in from the end side: from the left in Hebrew, from the right in English.
 */
export const screenVariants: Variants = {
  initial: ({ kind, direction, rtl }: ScreenMotion) => {
    if (kind === "fade") return { opacity: 0 };
    const side = rtl ? -1 : 1;
    return direction === "forward" ? { x: `${100 * side}%`, opacity: 1 } : { x: `${-30 * side}%`, opacity: 0.6 };
  },
  enter: ({ kind }: ScreenMotion) => (kind === "fade" ? { opacity: 1, transition: springs.surface } : { x: 0, opacity: 1, transition: springs.surface }),
  exit: ({ kind, direction, rtl }: ScreenMotion) => {
    if (kind === "fade") return { opacity: 0, transition: fadeOut };
    const side = rtl ? -1 : 1;
    return direction === "forward"
      ? { x: `${-30 * side}%`, opacity: 0.6, transition: springs.surface }
      : { x: `${100 * side}%`, opacity: 1, transition: springs.surface };
  },
};
