import type { ReactNode } from "react";
import { cx } from "../lib/cx";

interface HScrollProps {
  children: ReactNode;
  /** Names the row for screen readers, like "קבוצות פעילות". */
  label?: string;
  className?: string;
}

/**
 * A row that scrolls sideways and runs to the screen edges, for the phone group carousels.
 * It assumes the phone screen's 16px side padding. Give each child a fixed width and shrink-0, like "w-[196px] shrink-0".
 */
export function HScroll({ children, label, className }: HScrollProps) {
  return (
    <div role={label ? "group" : undefined} aria-label={label} className={cx("no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pt-0.5 pb-1.5", className)}>
      {children}
    </div>
  );
}
