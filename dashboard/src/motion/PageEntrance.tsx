import { motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { EntranceContext } from "./entrance";
import { PageMotionContext, pageLabels, type PageMode } from "./page-motion";
import { staggerVariants } from "./variants";

interface PageEntranceProps {
  mode: PageMode;
  /** The desktop reel is still travelling here: the content waits, then settles. */
  held?: boolean;
  children: ReactNode;
}

/**
 * A page's content as it opens. The visit's first page builds up under its outlet's own motion. Any other page settles
 * (or, passing by, stands) between labels of its own, so the outlet's movement never replays the build-up.
 */
export function PageEntrance({ mode, held = false, children }: PageEntranceProps) {
  const motionState = useMemo(() => ({ mode, held }), [mode, held]);
  const labels = pageLabels(motionState);
  return (
    <EntranceContext value={mode === "build"}>
      <PageMotionContext value={motionState}>
        {mode === "build" ? (
          children
        ) : (
          // "contents" keeps it out of the layout.
          <motion.div initial={labels.initial} animate={labels.animate} variants={staggerVariants} className="contents">
            {children}
          </motion.div>
        )}
      </PageMotionContext>
    </EntranceContext>
  );
}
