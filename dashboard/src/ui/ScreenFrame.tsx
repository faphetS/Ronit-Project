import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { pageLabels, usePageMotion } from "../motion/page-motion";
import { staggerVariants } from "../motion/variants";

/**
 * A screen's content column. Its cards build up on the visit's first page and settle softly on later ones; while the
 * desktop reel travels to the page, they wait. Below lg it leaves room for the tab bar.
 */
export function ScreenFrame({ children, className }: { children: ReactNode; className?: string }) {
  const labels = pageLabels(usePageMotion());
  return (
    <motion.div
      initial={labels.initial}
      animate={labels.animate}
      variants={staggerVariants}
      className={cx("flex flex-col gap-3.5 px-4 pt-3.5 pb-[124px] lg:gap-[18px] lg:px-0 lg:pt-0 lg:pb-0", className)}
    >
      {children}
    </motion.div>
  );
}
