import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export type StatusTone = "new" | "talking" | "sent" | "registered" | "irrelevant" | "warning" | "neutral";

const DOT: Record<StatusTone, string> = {
  new: "bg-status-new",
  talking: "bg-status-talking",
  sent: "bg-status-sent",
  registered: "bg-status-registered",
  irrelevant: "bg-status-irrelevant",
  warning: "bg-status-warning",
  neutral: "bg-faint",
};

interface StatusTagProps {
  tone?: StatusTone;
  onDark?: boolean;
  children: ReactNode;
}

/** Status as a dot plus words, never color alone. */
export function StatusTag({ tone = "neutral", onDark = false, children }: StatusTagProps) {
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-[7px] rounded-full px-3 text-[13px] font-medium whitespace-nowrap ring-1 ring-inset",
        onDark ? "bg-white/7 text-cream ring-white/20" : "bg-white/55 text-copy ring-ink/13",
      )}
    >
      <span aria-hidden="true" data-tone={tone} className={cx("size-[7px] shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
