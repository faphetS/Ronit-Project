import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { staggerVariants } from "../motion/variants";

/** A screen's content column: cards settle in one after another. Below lg it leaves room for the tab bar. */
export function ScreenFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="initial"
      animate="enter"
      variants={staggerVariants}
      className={cx("flex flex-col gap-3.5 px-4 pt-3.5 pb-[124px] lg:gap-[22px] lg:px-0 lg:pt-0 lg:pb-0", className)}
    >
      {children}
    </motion.div>
  );
}
