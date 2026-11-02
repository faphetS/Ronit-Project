import { useRef, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import { useFitText } from "./hooks";

interface FitHeadlineProps {
  /** The first line, then a <br /> and a soft second line sized in em. */
  children: ReactNode;
  /** The board's size in px. */
  size: number;
  /** Changes whenever the text does, so the size is fitted again. */
  fitKey: string;
  className?: string;
}

/** The orb card's big light words, like "חנוכה" over "04.12": the board's size, smaller only when a word would not fit. */
export function FitHeadline({ children, size, fitKey, className }: FitHeadlineProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  useFitText(ref, size, Math.round(size / 2), fitKey);
  return (
    <p ref={ref} className={cx("leading-none font-light text-ink", className)}>
      {children}
    </p>
  );
}
