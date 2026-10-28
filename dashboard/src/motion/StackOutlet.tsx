import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useState, type ReactNode } from "react";
import { useLocation, useNavigationType, useOutlet } from "react-router";
import { cx } from "../lib/cx";
import { ScreenPathContext } from "./screen-path";
import { resolveScreenTransition, type ScreenTransition } from "./transitions";
import { screenVariants } from "./variants";

interface StackScreenProps {
  pathname: string;
  pushed: boolean;
  transition: ScreenTransition;
  children: ReactNode;
}

/**
 * One screen in the stack. While it leaves, it keeps its own path (so its header does not
 * turn into the next screen's) and it is hidden from assistive tech and from input.
 */
function StackScreen({ pathname, pushed, transition, children }: StackScreenProps) {
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
      <ScreenPathContext value={pathname}>{children}</ScreenPathContext>
    </motion.div>
  );
}

interface StackOutletProps {
  isPushed: (pathname: string) => boolean;
  className?: string;
}

/**
 * Phone screens. Each screen is its own scroller, stacked so a push and a pop can overlap:
 * pushed screens sit above their list (z-index 2 over 1) both on the way in and on the way out.
 */
export function StackOutlet({ isPushed, className }: StackOutletProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const backHint = (location.state as { direction?: string } | null)?.direction === "back";

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

  return (
    <div className={cx("relative overflow-hidden", className)}>
      <AnimatePresence custom={transition}>
        <StackScreen key={location.pathname} pathname={location.pathname} pushed={isPushed(location.pathname)} transition={transition}>
          {outlet}
        </StackScreen>
      </AnimatePresence>
    </div>
  );
}
