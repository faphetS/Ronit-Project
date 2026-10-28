import { motion } from "motion/react";
import { cx } from "../lib/cx";
import { springs } from "../motion/springs";

interface MeterProps {
  /** 0 to 1. */
  value: number;
  label: string;
  onDark?: boolean;
  className?: string;
}

/** Thin progress bar that fills from the start side (the right, in RTL). */
export function Meter({ value, label, onDark = false, className }: MeterProps) {
  const share = Math.min(1, Math.max(0, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      className={cx("h-1.5 overflow-hidden rounded-full", onDark ? "bg-white/14" : "bg-ink/8", className)}
    >
      <motion.span
        className={cx("block h-full rounded-full", onDark ? "bg-gold" : "bg-ink")}
        style={{ width: `${share * 100}%`, originX: 1 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ ...springs.gentle, delay: 0.3 }}
      />
    </div>
  );
}
