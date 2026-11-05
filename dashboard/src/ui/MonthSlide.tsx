import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useDirection } from "../content/locale";
import { springs } from "../motion/springs";
import { slideFrom } from "../motion/variants";

interface MonthSlideProps {
  /** YYYY-MM: a new month remounts and slides in. */
  month: string;
  /** 1 after "next", -1 after "previous", 0 when the month hasn't changed (it stands, as when the page opens). */
  direction: -1 | 0 | 1;
  className?: string;
  children: ReactNode;
}

/** A month calendar's days: a new month slides 16px in from the side it comes from (in Hebrew, "next" from the left). */
export function MonthSlide({ month, direction, className, children }: MonthSlideProps) {
  const rtl = useDirection() === "rtl";
  return (
    <motion.div
      key={month}
      initial={direction === 0 ? false : { opacity: 0, x: slideFrom(direction, rtl) }}
      animate={{ opacity: 1, x: 0 }}
      transition={springs.settle}
      className={className}
    >
      {children}
    </motion.div>
  );
}
