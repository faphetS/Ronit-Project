import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { cardVariants } from "../motion/variants";

interface OrbCardProps {
  label: string;
  /** Content of the frosted strip (the date, the countdown...). */
  strip: ReactNode;
  /** Content of the white side: a short line at the top, an action at the bottom. */
  side?: ReactNode;
  /** Orb size and position in px: distance from the inline end, and from the top. */
  orb?: { size: number; end: number; top: number };
  /** Width of the frosted strip as a share of the card. */
  stripBasis?: string;
  compact?: boolean;
  className?: string;
}

/** White card with the gold orb half behind a frosted strip, like the reference. */
export function OrbCard({
  label,
  strip,
  side,
  orb = { size: 220, end: 70, top: 72 },
  stripBasis = "55%",
  compact = false,
  className,
}: OrbCardProps) {
  return (
    <motion.section
      aria-label={label}
      variants={cardVariants}
      className={cx("surface-card relative flex overflow-hidden", compact ? "rounded-card-phone p-2.5" : "rounded-card p-3", className)}
    >
      <span aria-hidden="true" className="orb absolute" style={{ width: orb.size, height: orb.size, insetInlineEnd: orb.end, top: orb.top }} />
      <div
        className={cx("frost relative flex shrink-0 flex-col gap-1.5", compact ? "rounded-[19px] p-[18px]" : "rounded-inner p-[22px]")}
        style={{ flexBasis: stripBasis }}
      >
        {strip}
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col items-end justify-between gap-3 p-2.5 text-end">{side}</div>
    </motion.section>
  );
}
