import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useState, type ReactNode } from "react";
import { useLocation, useNavigationType, useOutlet } from "react-router";
import { useDirection } from "../content/locale";
import { cx } from "../lib/cx";
import { useFirstPage } from "./entrance";
import { PageEntrance } from "./PageEntrance";
import { ScreenPathContext } from "./screen-path";
import { resolveScreenTransition, type ScreenTransition } from "./transitions";
import { screenVariants, type ScreenMotion } from "./variants";

interface StackScreenProps {
  pathname: string;
  pushed: boolean;
  /** The visit's first screen: its content builds up as it opens. */
  entrance: boolean;
  transition: ScreenMotion;
  children: ReactNode;
}

/**
 * One screen in the stack. While it leaves, it keeps its own path (so its header does not
 * turn into the next screen's) and it is hidden from assistive tech and from input.
 */
function StackScreen({ pathname, pushed, entrance, transition, children }: StackScreenProps) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      custom={transition}
      variants={screenVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      className="no-scrollbar absolute inset-0 overflow-y-auto"
      style={{ zIndex: pushed ? 2 : 1 }}
    >
      <ScreenPathContext value={pathname}>
        <PageEntrance entrance={entrance}>{children}</PageEntrance>
      </ScreenPathContext>
    </motion.div>
  );
}

interface StackOutletProps {
  isPushed: (pathname: string) => boolean;
  className?: string;
}

/**
 * Phone screens. Each screen is its own scroller, stacked so a push and a pop can overlap:
 * pushed screens sit above their list (z-index 2 over 1) both on the way in and on the way out. Only the visit's
 * first screen builds up inside; the others come in with their content in place.
 */
export function StackOutlet({ isPushed, className }: StackOutletProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const rtl = useDirection() === "rtl";
  const backHint = (location.state as { direction?: string } | null)?.direction === "back";
  const entrance = useFirstPage(location.pathname);

  const [shown, setShown] = useState<{ path: string; transition: ScreenTransition }>(() => ({
    path: location.pathname,
    transition: resolveScreenTransition({ from: null, to: location.pathname, navigationType, backHint, isPushed }),
  }));

  // Remember the previous path in state (React's pattern for reacting to a changed value during render).
  let transition = shown.transition;
  if (shown.path !== location.pathname) {
    transition = resolveScreenTransition({ from: shown.path, to: location.pathname, navigationType, backHint, isPushed });
    setShown({ path: location.pathname, transition });
  }
  const screenMotion: ScreenMotion = { ...transition, rtl };

  return (
    <div className={cx("relative overflow-hidden", className)}>
      <AnimatePresence custom={screenMotion}>
        <StackScreen key={location.pathname} pathname={location.pathname} pushed={isPushed(location.pathname)} entrance={entrance} transition={screenMotion}>
          {outlet}
        </StackScreen>
      </AnimatePresence>
    </div>
  );
}
