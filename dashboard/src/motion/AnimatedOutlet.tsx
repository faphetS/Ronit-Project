import { AnimatePresence, motion } from "motion/react";
import { useLocation, useOutlet } from "react-router";
import { pageVariants } from "./variants";

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
      <motion.div key={pageKey(location.pathname)} variants={pageVariants} initial="initial" animate="enter" exit="exit" className={className}>
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
