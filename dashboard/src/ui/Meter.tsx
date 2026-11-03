import { motion } from "motion/react";
import { useDirection } from "../content/locale";
import { cx } from "../lib/cx";
import { useEntrance } from "../motion/entrance";
import { springs } from "../motion/springs";

interface MeterProps {
  /** 0 to 1. */
  value: number;
  label: string;
  onDark?: boolean;
  className?: string;
}

/** Thin progress bar that fills from the start side: the right in Hebrew, the left in English. */
export function Meter({ value, label, onDark = false, className }: MeterProps) {
  const rtl = useDirection() === "rtl";
  const entrance = useEntrance();
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
        style={{ width: `${share * 100}%`, originX: rtl ? 1 : 0 }}
        initial={entrance ? { scaleX: 0 } : false}
        animate={{ scaleX: 1 }}
        transition={{ ...springs.gentle, delay: 0.3 }}
      />
    </div>
  );
}
