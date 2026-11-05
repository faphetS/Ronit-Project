import { AnimatePresence, motion, usePresence, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { NavigationType, UNSAFE_LocationContext as LocationContext, useLocation, useNavigationType, useOutlet, type Location } from "react-router";
import { useFirstPage } from "./entrance";
import type { PageMode } from "./page-motion";
import { PageEntrance } from "./PageEntrance";
import { PassingContext } from "./passing";
import { ScreenPathContext } from "./screen-path";
import { SETTLE_LEAD_MS, STAGGER_SECONDS } from "./springs";

/** A section's main page: what the reel shows as it spins past the section. */
export interface ReelSection {
  path: string;
  element: ReactElement;
}

interface SectionReelProps {
  /** Paths with the same key share one page, so changes inside it (like opening a panel) leave the reel still. */
  pageKey: (pathname: string) => string;
  /** A path's place on the reel, top to bottom, or -1 off it. */
  sectionOf: (pathname: string) => number;
  /** Each place's main page, in order. Without them the reel moves straight from one page to the next. */
  sections?: readonly ReelSection[];
  /** For each page: they lie one under the other on the strip, so absolute, inset-x 0, full height, scrolling. */
  className?: string;
}

/**
 * Where the reel is heading, whether it's still turning, and when it will stop (in performance.now() ms), for every
 * page on it, the leaving ones included.
 */
const ReelContext = createContext<{ target: number; turning: boolean; stopsAt: RefObject<number> } | null>(null);

// One section takes 0.55 s; each further one adds 0.17 s, up to 1.4 s. It gets going at once, then eases to a long,
// soft stop. The strip moves as one layer, animated by the browser itself, so work in the page can't make it stutter.
const STEP_MS = 550;
const EXTRA_MS = 170;
const MOST_MS = 1400;
const SPIN_EASING = "cubic-bezier(0.4, 0, 0.1, 1)";
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const FIRST_FADE_IN = { duration: 400, easing: EASE_OUT };
const FADE_IN = { duration: 220, easing: EASE_OUT };
const FADE_OUT = { duration: 120, easing: EASE_OUT, fill: "forwards" as const };
/** The visit's first page: its cards settle in one after another. */
const firstPage = { initial: {}, enter: { transition: { staggerChildren: STAGGER_SECONDS } } };

/** A section's main page as it passes by sits at its own address, so it never redraws for the address shown. */
const passingLocations = new Map<string, Location>();
function passingLocation(pathname: string): Location {
  let location = passingLocations.get(pathname);
  if (!location) {
    location = { pathname, search: "", hash: "", state: null, key: "reel" };
    passingLocations.set(pathname, location);
  }
  return location;
}

/** Where the strip stands, in places: mid-spin, the browser's animated value. */
function stripAt(strip: HTMLElement): number {
  const values = /matrix(3d)?\(([^)]+)\)/.exec(getComputedStyle(strip).transform)?.[2]?.split(",").map(Number);
  const y = values ? (values.length === 16 ? values[13] : values[5]) : 0;
  return strip.clientHeight > 0 && y !== undefined ? -y / strip.clientHeight : 0;
}

/** Runs `task` once the browser is idle, so clearing up after a spin never lands on its last frames. */
function whenIdle(task: () => void): void {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(task, { timeout: 400 });
  else setTimeout(task, 120);
}

interface ReelPageProps {
  index: number;
  /** The page's own address: live for the page shown, as it was for a page leaving, its main one for a page passing. */
  location: Location;
  navigationType: NavigationType;
  /** The visit's first page: it fades in and builds up. */
  entrance: boolean;
  /** Arrived where it stands (the first page, or another page of the same section): it fades in, nothing moves. */
  appears: boolean;
  /** Only shown while the reel spins past: hidden from assistive tech and input, and drawn lighter. */
  passing: boolean;
  className?: string;
  children: ReactNode;
}

function ReelPage({ index, location, navigationType, entrance, appears, passing, className, children }: ReelPageProps) {
  const reel = useContext(ReelContext);
  if (!reel) throw new Error("ReelPage outside SectionReel");
  const [isPresent, safeToRemove] = usePresence();
  const ref = useRef<HTMLDivElement>(null);
  const [fades] = useState(appears);
  // The page reads its own address from here: one leaving or passing by keeps the same one, so it doesn't redraw.
  const pinned = useMemo(() => ({ location, navigationType }), [location, navigationType]);
  // How the content opens is fixed when the page mounts: one that came in passing by stays still if the reel stops on it.
  const [mode] = useState<PageMode>(() => (entrance ? "build" : passing ? "still" : "settle"));
  // The reel's stop, mounted while it turns: the content waits, and settles just before the stop.
  const [released, setReleased] = useState(() => !(mode === "settle" && reel.turning));
  if (!released && !reel.turning) setReleased(true);
  const { stopsAt } = reel;
  useEffect(() => {
    if (released) return;
    const timer = setTimeout(() => setReleased(true), Math.max(0, stopsAt.current - performance.now() - SETTLE_LEAD_MS));
    return () => clearTimeout(timer);
  }, [released, stopsAt]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!fades || typeof element?.animate !== "function") return;
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], entrance ? FIRST_FADE_IN : FADE_IN);
    return () => animation.cancel();
  }, [fades, entrance]);

  // Leaving: a page of the same section fades where it stands; any other goes once the reel has stopped elsewhere.
  const inPlace = reel.target === index;
  useEffect(() => {
    if (isPresent) return;
    const element = ref.current;
    if (inPlace && typeof element?.animate === "function") {
      const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], FADE_OUT);
      animation.onfinish = () => safeToRemove();
      return () => animation.cancel();
    }
    if (inPlace || !reel.turning) safeToRemove();
  }, [isPresent, inPlace, reel.turning, safeToRemove]);

  const hidden = passing || !isPresent;
  return (
    <motion.div
      ref={ref}
      variants={entrance ? firstPage : undefined}
      initial={entrance ? "initial" : false}
      animate="enter"
      aria-hidden={hidden ? true : undefined}
      inert={hidden}
      style={{ top: `${index * 100}%` }}
      className={className}
    >
      <LocationContext value={pinned}>
        <PassingContext value={passing}>
          <ScreenPathContext value={location.pathname}>
            <PageEntrance mode={mode} held={!released}>
              {children}
            </PageEntrance>
          </ScreenPathContext>
        </PassingContext>
      </LocationContext>
    </motion.div>
  );
}

/**
 * Desktop pages on a reel, like a slot machine's: every section has its place on one strip, in the rail's order.
 * Opening another section spins the strip past the sections in between, fast at first, and eases it to a stop on
 * the one opened; the page left behind spins away as it was. Within a section, the new page fades in where it
 * stands. The visit's first page builds up; any later page's cards and rows settle softly as it lands, released just
 * before the reel stops. With Reduce Motion the reel jumps straight there.
 *
 * Kept light: the strip is one layer the browser animates by itself; pages leaving or passing by keep their own
 * address, so a page change doesn't redraw them; passing pages draw only what fits on screen; and the ones passed
 * are cleared once the browser is idle after the stop.
 */
export function SectionReel({ pageKey, sectionOf, sections = [], className }: SectionReelProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();
  const key = pageKey(location.pathname);
  const entrance = useFirstPage(key);
  const section = sectionOf(location.pathname);
  const strip = useRef<HTMLDivElement>(null);
  // Where the strip last stood still (or was sent from), and which spin is the latest.
  const settledAt = useRef(Math.max(section, 0));
  const spin = useRef(0);
  const stopsAt = useRef(0);
  // The reel's stop, the stretch of places it covers while turning (low to high), and the page it leaves.
  const [reel, setReel] = useState(() => {
    const target = Math.max(section, 0);
    return { key, target, low: target, high: target, left: -1, inPlace: true, turning: false };
  });

  // React's pattern for reacting to a changed value while rendering. Mid-spin the strip may stand anywhere on the
  // last spin's stretch, so a new spin covers that too.
  let current = reel;
  if (reel.key !== key) {
    const target = section >= 0 ? section : reel.target;
    const moves = target !== reel.target;
    const low = moves ? Math.min(reel.turning ? reel.low : reel.target, target) : reel.low;
    const high = moves ? Math.max(reel.turning ? reel.high : reel.target, target) : reel.high;
    current = { key, target, low, high, left: moves ? reel.target : -1, inPlace: !moves, turning: moves ? !reduceMotion : reel.turning };
    setReel(current);
  }
  const { target, low, high, left, inPlace, turning } = current;

  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    const running = element.getAnimations?.() ?? [];
    const start = running.length > 0 ? stripAt(element) : settledAt.current;
    for (const animation of running) animation.cancel();
    element.style.transform = `translateY(${-target * 100}%)`;
    settledAt.current = target;
    const distance = Math.abs(target - start);
    const id = ++spin.current;
    const stop = () => {
      if (spin.current === id) setReel((now) => (now.turning ? { ...now, turning: false, low: now.target, high: now.target } : now));
    };
    stopsAt.current = performance.now();
    if (distance < 0.001 || reduceMotion || typeof element.animate !== "function") {
      stop();
      return;
    }
    const duration = Math.min(MOST_MS, STEP_MS + EXTRA_MS * Math.max(0, distance - 1));
    stopsAt.current = performance.now() + duration;
    const animation = element.animate([{ transform: `translateY(${-start * 100}%)` }, { transform: `translateY(${-target * 100}%)` }], {
      duration,
      easing: SPIN_EASING,
    });
    animation.onfinish = () => whenIdle(stop);
  }, [target, reduceMotion]);

  // While turning, every place on the spin's stretch; once stopped, just the page shown.
  const pages: Array<{ key: string; index: number; location: Location; navigationType: NavigationType; element: ReactNode; passing: boolean }> = [];
  for (let index = turning ? low : target; index <= (turning ? high : target); index++) {
    if (index === target) {
      pages.push({ key, index, location, navigationType, element: outlet, passing: false });
      continue;
    }
    // The page left behind spins away as it was (AnimatePresence keeps it): not as its section's main page.
    const passed = sections[index];
    if (index === left || !passed) continue;
    pages.push({ key: pageKey(passed.path), index, location: passingLocation(passed.path), navigationType: NavigationType.Pop, element: passed.element, passing: true });
  }

  const reelState = useMemo(() => ({ target, turning, stopsAt }), [target, turning]);
  return (
    <ReelContext value={reelState}>
      <div ref={strip} className="absolute inset-0 will-change-transform">
        <AnimatePresence>
          {pages.map((page) => (
            <ReelPage
              key={page.key}
              index={page.index}
              location={page.location}
              navigationType={page.navigationType}
              entrance={entrance && page.key === key}
              appears={page.key === key && (entrance || inPlace)}
              passing={page.passing}
              className={className}
            >
              {page.element}
            </ReelPage>
          ))}
        </AnimatePresence>
      </div>
    </ReelContext>
  );
}
