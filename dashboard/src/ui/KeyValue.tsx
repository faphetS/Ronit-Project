import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import type { SurfaceVariant } from "./Surface";
import { DIVIDER, MUTE_TEXT, STRONG_TEXT } from "./surface-tones";

export interface KeyValueItem {
  key: string;
  label: ReactNode;
  /** Wrap phone and passport numbers in <Ltr>. */
  value: ReactNode;
}

interface KeyValueProps {
  items: KeyValueItem[];
  /** "rows": label at the start, value at the end, lines between. "grid": label over value, in columns (passport fields). */
  layout?: "rows" | "grid";
  /** Grid columns: 3 on desktop, 2 on phones. */
  columns?: 2 | 3;
  surface?: SurfaceVariant;
  className?: string;
}

/** Labels and values in a description list. */
export function KeyValue({ items, layout = "rows", columns = 3, surface = "card", className }: KeyValueProps) {
  if (layout === "grid") {
    return (
      <dl className={cx("grid", columns === 2 ? "grid-cols-2 gap-x-4 gap-y-3.5" : "grid-cols-3 gap-x-5 gap-y-4", className)}>
        {items.map((item) => (
          <div key={item.key} className="min-w-0">
            <dt className={cx("text-caption", MUTE_TEXT[surface])}>{item.label}</dt>
            <dd className={cx("mt-[3px] text-[15px] font-medium break-words", STRONG_TEXT[surface])}>{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className={className}>
      {items.map((item) => (
        <div key={item.key} className={cx("flex items-baseline justify-between gap-4 border-t py-[11px] text-[14.5px] first:border-t-0", DIVIDER[surface])}>
          <dt className={MUTE_TEXT[surface]}>{item.label}</dt>
          <dd className={cx("text-end font-medium", STRONG_TEXT[surface])}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
