import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useState, type ReactNode } from "react";
import { useLocation, useNavigationType, useOutlet } from "react-router";
import { useFirstPage } from "./entrance";
import { PageEntrance } from "./PageEntrance";
import { ScreenPathContext } from "./screen-path";
import { pageSlideVariants, pageVariants } from "./variants";

interface PageProps {
  pathname: string;
  /** The visit's first page: its content builds up as it opens. */
  entrance: boolean;
  /** 1: the page comes up from below. -1: down from above. */
  direction: number;
  className?: string;
  children: ReactNode;
}

/** One desktop page. While it slides out it keeps its own path and is hidden from assistive tech and input. */
function Page({ pathname, entrance, direction, className, children }: PageProps) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      custom={direction}
      variants={entrance ? pageVariants : pageSlideVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      className={className}
    >
      <ScreenPathContext value={pathname}>
        <PageEntrance entrance={entrance}>{children}</PageEntrance>
      </ScreenPathContext>
    </motion.div>
  );
}

interface AnimatedOutletProps {
  /** Paths with the same key share one page, so changes inside it (like opening a panel) do not animate. */
  pageKey?: (pathname: string) => string;
  /** A page's place top to bottom, or -1: whether the next page comes up from below or down from above. */
  pageOrder?: (pathname: string) => number;
  /** For each page. Two pages overlap while they slide, so each needs a box of its own: absolute, inset 0, scrolling. */
  className?: string;
}

/**
 * Desktop page changes: the two pages slide together like a pager, so the panel is never blank. A page further down
 * the order comes up from below, one further up comes down from above; within one place, a new page comes from below
 * and Back from above. Only the visit's first page builds up inside; the others arrive with their content in place.
 */
export function AnimatedOutlet({ pageKey = (pathname) => pathname, pageOrder, className }: AnimatedOutletProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const key = pageKey(location.pathname);
  const entrance = useFirstPage(key);
  // The page shown, and the way the last change went (React's pattern for reacting to a changed value while rendering).
  const [shown, setShown] = useState({ key, pathname: location.pathname, direction: 1 });
  let direction = shown.direction;
  if (shown.key !== key) {
    const from = pageOrder?.(shown.pathname) ?? -1;
    const to = pageOrder?.(location.pathname) ?? -1;
    direction = from >= 0 && to >= 0 && from !== to ? Math.sign(to - from) : navigationType === "POP" ? -1 : 1;
    setShown({ key, pathname: location.pathname, direction });
  }
  return (
    <AnimatePresence custom={direction}>
      <Page key={key} pathname={location.pathname} entrance={entrance} direction={direction} className={className}>
        {outlet}
      </Page>
    </AnimatePresence>
  );
}
