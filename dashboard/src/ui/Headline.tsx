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
  size?: HeadlineSize;
  level?: 1 | 2;
  onDark?: boolean;
  className?: string;
}

/** Big light two-tone headline: a dark first line and a soft second line. */
export function Headline({ title, soft, size = "display", level = 1, onDark = false, className }: HeadlineProps) {
  const Tag = level === 1 ? motion.h1 : motion.h2;
  return (
    <Tag variants={headlineVariants} className={cx(SIZE_CLASS[size], "font-light", onDark ? "text-cream" : "text-ink", className)}>
      {title}{" "}
      {soft ? (
        <>
          <br />
          <span className={onDark ? "text-ink-soft" : "text-faint"}>{soft}</span>
        </>
      ) : null}
    </Tag>
  );
}
