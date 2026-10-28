import { motion, type HTMLMotionProps } from "motion/react";
import { cx } from "../lib/cx";
import { cardVariants } from "../motion/variants";

export type SurfaceVariant = "glass" | "card" | "ink";

const VARIANT_CLASS: Record<SurfaceVariant, string> = {
  glass: "surface-glass",
  card: "surface-card",
  ink: "surface-ink",
};

interface SurfaceProps extends HTMLMotionProps<"section"> {
  variant: SurfaceVariant;
  /** Phone density: smaller radius and padding. */
  compact?: boolean;
  as?: "section" | "div";
}

/** One of the three surfaces. Inside an animating screen it settles in with the other cards. */
export function Surface({ variant, compact = false, as = "section", className, ...rest }: SurfaceProps) {
  const Tag = (as === "div" ? motion.div : motion.section) as typeof motion.section;
  return (
    <Tag
      variants={cardVariants}
      className={cx(VARIANT_CLASS[variant], compact ? "rounded-card-phone p-[18px]" : "rounded-card px-[22px] py-5", className)}
      {...rest}
    />
  );
}
