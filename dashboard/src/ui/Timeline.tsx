import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import type { SurfaceVariant } from "./Surface";
import { BODY_TEXT, MUTE_TEXT, STRONG_TEXT } from "./surface-tones";

export interface TimelineEntry {
  key: string;
  title: ReactNode;
  /** When and who, small and muted: "27.10 · מורן". */
  meta?: ReactNode;
  /** A quieter entry, like an import from Monday: a pale dot and a regular-weight title. */
  soft?: boolean;
}

interface TimelineProps {
  /** Newest first. */
  entries: TimelineEntry[];
  /** Names the list, when no heading right above it does. */
  label?: string;
  /** Gold dots on black cards. */
  surface?: SurfaceVariant;
  className?: string;
}

/** Dated entries joined by a line: lead history, the passport access log, sensitive actions. */
export function Timeline({ entries, label, surface = "card", className }: TimelineProps) {
  const dark = surface === "ink";
  return (
    <ol aria-label={label} className={className}>
      {entries.map((entry, index) => (
        <li key={entry.key} className="relative ps-6 pb-4 last:pb-0">
          <span
            aria-hidden="true"
            className={cx("absolute start-[3px] top-[7px] size-[9px] rounded-full", entry.soft ? (dark ? "bg-white/30" : "bg-status-irrelevant") : dark ? "bg-gold" : "bg-ink")}
          />
          {index < entries.length - 1 ? (
            <span aria-hidden="true" className={cx("absolute start-[7px] top-5 bottom-0.5 w-px", dark ? "bg-white/16" : "bg-ink/14")} />
          ) : null}
          <p className={entry.soft ? BODY_TEXT[surface] : cx("font-medium", STRONG_TEXT[surface])}>{entry.title}</p>
          {entry.meta ? <p className={cx("text-caption", MUTE_TEXT[surface])}>{entry.meta}</p> : null}
        </li>
      ))}
    </ol>
  );
}
