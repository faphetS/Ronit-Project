import { motion } from "motion/react";
import { useCopy, useDirection } from "../content/locale";
import { cx } from "../lib/cx";
import { formatNumber } from "../lib/format";
import { springs } from "../motion/springs";
import { BigNumber } from "./BigNumber";
import type { SurfaceVariant } from "./Surface";
import { MUTE_TEXT } from "./surface-tones";

/** accent: the good outcome (read). neutral: in between (delivered). warning: failed. */
export type ProportionTone = "accent" | "neutral" | "warning";

export interface ProportionPart {
  key: string;
  /** "נקראו". */
  label: string;
  value: number;
  tone: ProportionTone;
}

interface ProportionBarProps {
  /** In order along the bar, from the start side. */
  parts: ProportionPart[];
  /** Screen-reader summary. By default "331 נקראו, 74 נמסרו, 7 נכשלו מתוך 412". */
  label?: string;
  /** "figures": each part's dot, name and big number (desktop). "inline": one small line (phones). "none": the bar alone. */
  legend?: "figures" | "inline" | "none";
  surface?: SurfaceVariant;
  /** 12px tall instead of 14px. */
  compact?: boolean;
  className?: string;
}

// Theme tokens checked with the dataviz palette validator: the adjacent pairs clear the normal-vision floor
// on both surfaces. The neutral is quieter than its neighbours, so a legend (or the label) always names the parts.
const FILL: Record<ProportionTone, { light: string; dark: string }> = {
  accent: { light: "bg-ink", dark: "bg-gold" },
  neutral: { light: "bg-ink-soft", dark: "bg-mute" },
  warning: { light: "bg-status-warning", dark: "bg-status-warning" },
};

/** Part-to-whole in one thin bar: rounded outer ends, a 2px gap between parts, growing from the start side. */
export function ProportionBar({ parts, label, legend = "figures", surface = "card", compact = false, className }: ProportionBarProps) {
  const { uiCopy } = useCopy();
  const rtl = useDirection() === "rtl";
  const dark = surface === "ink";
  const fill = (tone: ProportionTone) => FILL[tone][dark ? "dark" : "light"];
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const summary = label ?? `${parts.map((part) => `${formatNumber(part.value)} ${part.label}`).join(", ")} ${uiCopy.ofTotal(formatNumber(total))}`;
  const shown = parts.filter((part) => part.value > 0);
  const withLegend = legend !== "none";

  return (
    <div className={className}>
      <motion.div
        role={withLegend ? undefined : "img"}
        aria-label={withLegend ? undefined : summary}
        aria-hidden={withLegend ? true : undefined}
        className={cx("flex gap-0.5", compact ? "h-3" : "h-3.5")}
        style={{ originX: rtl ? 1 : 0 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ ...springs.gentle, delay: 0.3 }}
      >
        {shown.map((part, index) => (
          <span
            key={part.key}
            className={cx("h-full min-w-1", fill(part.tone), index === 0 && "rounded-s-[4px]", index === shown.length - 1 && "rounded-e-[4px]")}
            style={{ flex: `${part.value} 1 0%` }}
          />
        ))}
      </motion.div>
      {legend === "figures" ? (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {parts.map((part) => (
            <div key={part.key}>
              <dt className={cx("flex items-center gap-1.5 text-caption", MUTE_TEXT[surface])}>
                <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", fill(part.tone))} />
                {part.label}
              </dt>
              <BigNumber as="dd" value={part.value} size={34} surface={surface} className="mt-1" />
            </div>
          ))}
        </dl>
      ) : null}
      {legend === "inline" ? (
        <ul className={cx("mt-3 flex flex-wrap gap-x-3 gap-y-1 text-small", MUTE_TEXT[surface])}>
          {parts.map((part) => (
            <li key={part.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", fill(part.tone))} />
              {`${formatNumber(part.value)} ${part.label}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
