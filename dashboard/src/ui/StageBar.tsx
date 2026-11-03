import { motion } from "motion/react";
import { useCopy, useDirection } from "../content/locale";
import { cx } from "../lib/cx";
import { useEntrance } from "../motion/entrance";
import { springs } from "../motion/springs";
import type { SurfaceVariant } from "./Surface";

interface StageBarProps {
  /** The stage names, in order: כתיבה, בדיקה, אישור, שליחה. */
  stages: string[];
  /** Index of the current stage. Earlier stages show as done. */
  current: number;
  surface?: SurfaceVariant;
  className?: string;
}

/**
 * A campaign's stage as a segmented bar with the stage names under it: done segments dark, the current one gold,
 * the rest pale, and the current name in bold, so the stage never rests on color alone. Read as "שלב 3 מתוך 4: אישור".
 */
export function StageBar({ stages, current, surface = "card", className }: StageBarProps) {
  const { uiCopy } = useCopy();
  const rtl = useDirection() === "rtl";
  const entrance = useEntrance();
  const dark = surface === "ink";
  const at = Math.min(Math.max(current, 0), stages.length - 1);
  return (
    <div role="img" aria-label={uiCopy.stage(at + 1, stages.length, stages[at] ?? "")} className={className}>
      <div className="flex gap-1">
        {stages.map((stage, index) => (
          <span key={`${index}-${stage}`} className={cx("h-1.5 flex-1 overflow-hidden rounded-full", dark ? "bg-white/14" : "bg-ink/10")}>
            {index <= at ? (
              <motion.span
                className={cx("block h-full rounded-full", index === at ? "bg-gold" : dark ? "bg-cream" : "bg-ink")}
                style={{ originX: rtl ? 1 : 0 }}
                initial={entrance ? { scaleX: 0 } : false}
                animate={{ scaleX: 1 }}
                transition={{ ...springs.gentle, delay: 0.2 + index * 0.08 }}
              />
            ) : null}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-1">
        {stages.map((stage, index) => (
          <span
            key={`${index}-${stage}`}
            className={cx(
              "min-w-0 flex-1 text-center text-[12px] leading-tight",
              index === at ? cx("font-semibold", dark ? "text-cream" : "text-ink") : dark ? "text-ink-mute" : "text-mute",
            )}
          >
            {stage}
          </span>
        ))}
      </div>
    </div>
  );
}
