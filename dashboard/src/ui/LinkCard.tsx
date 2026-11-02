import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { springs } from "../motion/springs";
import { cardVariants } from "../motion/variants";
import { MotionLink } from "./MotionLink";
import type { SurfaceVariant } from "./Surface";

interface LinkCardProps {
  to: string;
  /** "ink" for the selected card, "card" for the others. */
  variant: SurfaceVariant;
  /** Marks the selected card with aria-current. */
  current?: boolean;
  /** Phone density: smaller radius and padding. */
  compact?: boolean;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<SurfaceVariant, string> = {
  glass: "surface-glass",
  card: "surface-card hover:shadow-card-hover",
  ink: "surface-ink",
};

/** A whole card that is a link, like a group card. It settles in with the other cards and lifts 3px on hover. */
export function LinkCard({ to, variant, current = false, compact = false, children, className }: LinkCardProps) {
  return (
    <MotionLink
      to={to}
      aria-current={current ? "true" : undefined}
      variants={cardVariants}
      whileHover={{ y: -3, transition: springs.ui }}
      className={cx("block", VARIANT_CLASS[variant], compact ? "rounded-card-phone p-[18px]" : "rounded-card px-[22px] py-5", className)}
    >
      {children}
    </MotionLink>
  );
}
