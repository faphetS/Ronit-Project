import { motion } from "motion/react";
import { cx } from "../lib/cx";
import { formatNumber } from "../lib/format";
import { useEntrance } from "../motion/entrance";
import { springs } from "../motion/springs";
import type { SurfaceVariant } from "./Surface";

export interface WeekBar {
  /** Stable key, like the week's start date. */
  key: string;
  /** Axis label: "6.9", or "השבוע" for this week. Also read by screen readers. */
  label: string;
  value: number;
}

interface WeekBarsProps {
  /** Oldest first. In Hebrew time runs right to left, so this week ends up at the left. */
  bars: WeekBar[];
  /** What the bars count, for screen readers: "לידים חדשים בכל שבוע, 8 השבועות האחרונים". */
  label: string;
  /** The highlighted week. The last one by default. */
  currentIndex?: number;
  /** "ink" on the black card: past weeks soft, this week gold. Elsewhere: past weeks sand, this week black. */
  surface?: SurfaceVariant;
  /** Phone size: a 64px plot without the axis or values. */
  compact?: boolean;
  className?: string;
}

const GROW_DELAY = 0.2;
const GROW_STAGGER = 0.03;
// Desktop: a 110px plot with 28px above it for the value over the tallest bar. Phones: 64px, no values.
const PLOT = { regular: "h-[138px] gap-4 pt-7", compact: "h-16 gap-2.5" } as const;

/**
 * A quiet weekly column chart. One series, so no legend: the card title names it. Thin columns (24px at most)
 * with rounded data ends grow from the baseline. This week is highlighted and labeled with its value; the
 * other values show on hover, and all of them while the chart has keyboard focus. Screen readers get every
 * week and value as a list.
 */
export function WeekBars({ bars, label, currentIndex = bars.length - 1, surface = "card", compact = false, className }: WeekBarsProps) {
  const dark = surface === "ink";
  const entrance = useEntrance();
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <figure className={className}>
      <ol
        aria-label={label}
        tabIndex={compact ? undefined : 0}
        className={cx("group/plot flex items-end", PLOT[compact ? "compact" : "regular"], dark && "focus-visible:outline-cream")}
      >
        {bars.map((bar, index) => {
          const current = index === currentIndex;
          const height = `${(bar.value / max) * 100}%`;
          const value = formatNumber(bar.value);
          const delay = GROW_DELAY + index * GROW_STAGGER;
          return (
            <li key={bar.key} className="group/bar relative flex h-full min-w-0 flex-1 items-end justify-center">
              <span className="sr-only">{`${bar.label}: ${value}`}</span>
              <motion.span
                aria-hidden="true"
                className={cx("block w-full max-w-6 rounded-t-[4px]", current ? (dark ? "bg-gold" : "bg-ink") : dark ? "bg-white/13" : "bg-ink/10")}
                style={{ height, originY: 1 }}
                initial={entrance ? { scaleY: 0 } : false}
                animate={{ scaleY: 1 }}
                transition={{ ...springs.gentle, delay }}
              />
              {compact ? null : current ? (
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 flex justify-center"
                  style={{ bottom: `calc(${height} + 2px)` }}
                  initial={entrance ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ ...springs.gentle, delay: delay + 0.25 }}
                >
                  <span className={cx("px-2 text-[12px] leading-4 font-semibold", dark ? "text-cream" : "text-ink")}>{value}</span>
                </motion.span>
              ) : (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 flex justify-center opacity-0 transition-opacity group-hover/bar:opacity-100 group-focus-visible/plot:opacity-100 motion-reduce:transition-none"
                  style={{ bottom: `calc(${height} + 6px)` }}
                >
                  <span className={cx("rounded-lg px-2 py-[3px] text-[12px] leading-4 font-semibold whitespace-nowrap", dark ? "bg-cream text-ink" : "bg-ink text-cream")}>{value}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {compact ? null : (
        <div aria-hidden="true" className="mt-2 flex gap-4">
          {bars.map((bar) => (
            <span key={bar.key} className={cx("min-w-0 flex-1 truncate text-center text-[12px]", dark ? "text-ink-mute" : "text-mute")}>
              {bar.label}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
