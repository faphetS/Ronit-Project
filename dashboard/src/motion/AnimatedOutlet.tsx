import { AnimatePresence, motion, useIsPresent } from "motion/react";
import type { ReactNode } from "react";
import { useLocation, useOutlet } from "react-router";
import { ScreenPathContext } from "./screen-path";
import { pageVariants } from "./variants";

interface PageProps {
  pathname: string;
  className?: string;
  children: ReactNode;
}

/** One desktop page. While it fades out it keeps its own path and is hidden from assistive tech and input. */
function Page({ pathname, className, children }: PageProps) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      className={className}
    >
      <ScreenPathContext value={pathname}>{children}</ScreenPathContext>
    </motion.div>
  );
}

interface AnimatedOutletProps {
  /** Paths with the same key share one page, so changes inside it (like opening a panel) do not animate. */
  pageKey?: (pathname: string) => string;
  className?: string;
}

/** Desktop page changes: the old page fades out fast, then the new one rises in. */
export function AnimatedOutlet({ pageKey = (pathname) => pathname, className }: AnimatedOutletProps) {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait">
      <Page key={pageKey(location.pathname)} pathname={location.pathname} className={className}>
        {outlet}
      </Page>
    </AnimatePresence>
  );
}
