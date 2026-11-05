import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { CARD_PRESS_SCALE, springs } from "../motion/springs";
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
  glass: "surface-glass lift-shadow",
  card: "surface-card lift-shadow",
  ink: "surface-ink",
};

/**
 * A whole card that is a link, like a group card. It settles in with the other cards, lifts 2px with a deeper shadow
 * under the mouse, and gives a little when pressed.
 */
export function LinkCard({ to, variant, current = false, compact = false, children, className }: LinkCardProps) {
  return (
    <MotionLink
      to={to}
      aria-current={current ? "true" : undefined}
      variants={cardVariants}
      whileHover={{ y: -2, transition: springs.ui }}
      whileTap={{ scale: CARD_PRESS_SCALE, transition: springs.ui }}
      className={cx("block", VARIANT_CLASS[variant], compact ? "rounded-card-phone p-[18px]" : "rounded-card px-[22px] py-5", className)}
    >
      {children}
    </MotionLink>
  );
}
