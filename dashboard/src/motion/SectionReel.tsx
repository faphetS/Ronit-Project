import { animate, AnimatePresence, motion, useMotionValue, usePresence, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactElement, type ReactNode } from "react";
import { useLocation, useOutlet } from "react-router";
import { useFirstPage } from "./entrance";
import { PageEntrance } from "./PageEntrance";
import { ScreenPathContext } from "./screen-path";
import { fadeOut, springs, STAGGER_SECONDS } from "./springs";

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
  /** For each page. The pages lie on top of each other, so each needs its own box: absolute, inset 0, scrolling. */
  className?: string;
}

/** Where the reel stands (in sections) and where it's heading, for every page on it, the leaving ones included. */
const ReelContext = createContext<{ position: MotionValue<number>; target: number } | null>(null);

// One section takes 0.55 s; each further one adds 0.17 s, up to 1.4 s. Fast in the middle, easing to a stop.
const STEP_SECONDS = 0.55;
const EXTRA_SECONDS = 0.17;
const MOST_SECONDS = 1.4;
const SPIN_EASE = [0.65, 0, 0.2, 1] as const;
const appear = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
/** The visit's first page: its cards settle in one after another. */
const firstPage = { initial: {}, enter: { transition: { staggerChildren: STAGGER_SECONDS } } };

interface ReelPageProps {
  index: number;
  pathname: string;
  /** The visit's first page: it fades in and builds up. */
  entrance: boolean;
  /** Arrived where it stands (the first page, or another page of the same section): it fades in, nothing moves. */
  appears: boolean;
  /** Only shown while the reel spins past: hidden from assistive tech and input. */
  passing: boolean;
  className?: string;
  children: ReactNode;
}

function ReelPage({ index, pathname, entrance, appears, passing, className, children }: ReelPageProps) {
  const reel = useContext(ReelContext);
  if (!reel) throw new Error("ReelPage outside SectionReel");
  const [isPresent, safeToRemove] = usePresence();
  const [faded] = useState(appears);
  const y = useTransform(reel.position, (at) => `${(index - at) * 100}%`);
  const opacity = useMotionValue(faded ? 0 : 1);

  useEffect(() => {
    if (!faded) return;
    const controls = animate(opacity, 1, entrance ? springs.surface : appear);
    return () => controls.stop();
  }, [faded, entrance, opacity]);

  // Leaving: a page of the same section fades where it stands; any other goes once the reel has turned it out of view.
  const inPlace = reel.target === index;
  useEffect(() => {
    if (isPresent) return;
    if (inPlace) {
      const controls = animate(opacity, 0, { ...fadeOut, onComplete: safeToRemove });
      return () => controls.stop();
    }
    const goneWhenOut = (at: number) => {
      if (Math.abs(index - at) >= 1) safeToRemove();
    };
    goneWhenOut(reel.position.get());
    return reel.position.on("change", goneWhenOut);
  }, [isPresent, inPlace, index, opacity, reel.position, safeToRemove]);

  const hidden = passing || !isPresent;
  return (
    <motion.div
      style={{ y, opacity }}
      variants={entrance ? firstPage : undefined}
      initial={entrance ? "initial" : false}
      animate="enter"
      aria-hidden={hidden ? true : undefined}
      inert={hidden}
      className={className}
    >
      <ScreenPathContext value={pathname}>
        <PageEntrance entrance={entrance}>{children}</PageEntrance>
      </ScreenPathContext>
    </motion.div>
  );
}

/**
 * Desktop pages on a reel, like a slot machine's: every section has its place on one strip, in the rail's order.
 * Opening another section spins the strip past the sections in between, fast in the middle, and eases it to a stop
 * on the one opened; the page left behind spins away as it was. Within a section, the new page fades in where it
 * stands. Only the visit's first page builds up; the others arrive with their content in place. With Reduce Motion
 * the reel jumps straight there.
 */
export function SectionReel({ pageKey, sectionOf, sections = [], className }: SectionReelProps) {
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();
  const key = pageKey(location.pathname);
  const entrance = useFirstPage(key);
  const section = sectionOf(location.pathname);
  const [reel, setReel] = useState(() => ({ key, target: Math.max(section, 0), left: -1, inPlace: true }));
  const position = useMotionValue(reel.target);
  // Redraws once a spin ends, so the pages it passed leave.
  const [, settled] = useState(0);

  // React's pattern for reacting to a changed value while rendering: the reel's next stop, and the page it leaves.
  let current = reel;
  if (reel.key !== key) {
    const target = section >= 0 ? section : reel.target;
    current = { key, target, left: target === reel.target ? -1 : reel.target, inPlace: target === reel.target };
    setReel(current);
  }
  const { target, left, inPlace } = current;

  useLayoutEffect(() => {
    const distance = Math.abs(target - position.get());
    if (distance === 0) return;
    if (reduceMotion) {
      position.set(target);
      return;
    }
    const seconds = Math.min(MOST_SECONDS, STEP_SECONDS + EXTRA_SECONDS * Math.max(0, distance - 1));
    const controls = animate(position, target, { duration: seconds, ease: SPIN_EASE, onComplete: () => settled((count) => count + 1) });
    return () => controls.stop();
  }, [target, position, reduceMotion]);

  // The places from where the reel stands now to where it's heading. It only moves between renders while spinning,
  // and toward the target, so this range only shrinks until it settles on one page.
  const at = reduceMotion ? target : position.get();
  const pages: Array<{ key: string; index: number; pathname: string; element: ReactNode; passing: boolean }> = [];
  for (let index = Math.floor(Math.min(at, target)); index <= Math.ceil(Math.max(at, target)); index++) {
    if (index === target) {
      pages.push({ key, index, pathname: location.pathname, element: outlet, passing: false });
      continue;
    }
    // The page left behind spins away as it was (AnimatePresence keeps it): not as its section's main page.
    const passed = sections[index];
    if (index === left || !passed) continue;
    pages.push({ key: pageKey(passed.path), index, pathname: passed.path, element: passed.element, passing: true });
  }

  return (
    <ReelContext value={{ position, target }}>
      <AnimatePresence>
        {pages.map((page) => (
          <ReelPage
            key={page.key}
            index={page.index}
            pathname={page.pathname}
            entrance={entrance && page.key === key}
            appears={page.key === key && (entrance || inPlace)}
            passing={page.passing}
            className={className}
          >
            {page.element}
          </ReelPage>
        ))}
      </AnimatePresence>
    </ReelContext>
  );
}
