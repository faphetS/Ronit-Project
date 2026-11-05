import { createContext, useContext } from "react";

/**
 * How a page's content opens.
 * - "build": the visit's first page builds up: cards settle one after another, numbers count up, bars grow.
 * - "settle": any later page: its cards and rows rise softly into place; numbers and bars stand at their values.
 * - "still": a page the reel only passes, or a phone screen pushed in: its content stands as it is.
 */
export type PageMode = "build" | "settle" | "still";

export interface PageMotion {
  mode: PageMode;
  /** The desktop reel is still travelling to this page: its content waits. */
  held: boolean;
}

/** Outside the outlets, as in tests, content builds up as the visit's first page did (like EntranceContext). */
export const PageMotionContext = createContext<PageMotion>({ mode: "build", held: false });

export function usePageMotion(): PageMotion {
  return useContext(PageMotionContext);
}

/** The variant labels a page's content moves between, for the component that leads it, like ScreenFrame. */
export function pageLabels({ mode, held }: PageMotion): { initial: false | "initial" | "held"; animate: "enter" | "held" | "settled" } {
  if (mode === "build") return { initial: "initial", animate: "enter" };
  if (mode === "still") return { initial: false, animate: "settled" };
  return { initial: "held", animate: held ? "held" : "settled" };
}
