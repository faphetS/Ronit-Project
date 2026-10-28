import { motion } from "motion/react";
import { useRef } from "react";
import { cx } from "../lib/cx";
import { formatNumber } from "../lib/format";
import { useCountUp } from "./count-up";
import type { SurfaceVariant } from "./Surface";

interface BigNumberProps {
  /** Numbers are formatted (1,284). Strings show as given ("91%"). */
  value: number | string;
  /** Shown softer after a slash: 32/40. */
  total?: number | string;
  /** Font size in px. The soft total uses the faint tone, so keep it 24px or larger when there is a total. */
  size: number;
  surface?: SurfaceVariant;
  /** Count up from zero the first time it comes into view. For the one hero number on a screen. */
  countUp?: boolean;
  as?: "p" | "span" | "dd" | "div";
  className?: string;
}

function CountingValue({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = useCountUp(value, ref);
  return (
    <>
      <motion.span ref={ref} aria-hidden="true">
        {text}
      </motion.span>
      <span className="sr-only">{formatNumber(value)}</span>
    </>
  );
}

/** A large light figure, like 14, 1,284 or 32/40. Proportional digits, as large numbers read better that way. */
export function BigNumber({ value, total, size, surface = "card", countUp = false, as: Tag = "p", className }: BigNumberProps) {
  const dark = surface === "ink";
  return (
    <Tag className={cx("leading-[0.95] font-light lining-nums", dark ? "text-cream" : "text-ink", className)} style={{ fontSize: size }}>
      {countUp && typeof value === "number" ? <CountingValue value={value} /> : typeof value === "number" ? formatNumber(value) : value}
      {total === undefined ? null : <span className={dark ? "text-ink-soft" : "text-faint"}>/{typeof total === "number" ? formatNumber(total) : total}</span>}
    </Tag>
  );
}
