import { motion } from "motion/react";
import { cx } from "../lib/cx";
import { headlineVariants } from "../motion/variants";

type HeadlineSize = "display" | "display-2" | "display-3";

const SIZE_CLASS: Record<HeadlineSize, string> = {
  display: "text-display",
  "display-2": "text-display-2",
  "display-3": "text-display-3",
};

interface HeadlineProps {
  title: string;
  /** Second line, in the soft tone. */
  soft?: string;
  /** The soft part on the title's line instead of under it. */
  inline?: boolean;
  size?: HeadlineSize;
  level?: 1 | 2;
  onDark?: boolean;
  className?: string;
}

/** Big light two-tone headline: a dark first line and a soft second line, or both on one line (`inline`). */
export function Headline({ title, soft, inline = false, size = "display", level = 1, onDark = false, className }: HeadlineProps) {
  const Tag = level === 1 ? motion.h1 : motion.h2;
  return (
    <Tag variants={headlineVariants} className={cx(SIZE_CLASS[size], "font-light", onDark ? "text-cream" : "text-ink", className)}>
      {title}{" "}
      {soft ? (
        <>
          {inline ? null : <br />}
          <span className={onDark ? "text-ink-soft" : "text-faint"}>{soft}</span>
        </>
      ) : null}
    </Tag>
  );
}
