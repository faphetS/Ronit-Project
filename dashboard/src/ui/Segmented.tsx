import { LayoutGroup, motion } from "motion/react";
import { Link } from "react-router";
import { cx } from "../lib/cx";
import { springs } from "../motion/springs";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** With a destination on every option, the control is navigation. */
  to?: string;
  /** The label's language, when it differs from the page's. */
  lang?: string;
  /** Accessible name, when the visible label is an abbreviation. */
  ariaLabel?: string;
}

interface SegmentedProps<T extends string> {
  id: string;
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  className?: string;
}

/** iOS-style segmented control: a white pill glides over a soft track. */
export function Segmented<T extends string>({ id, label, options, value, onChange, className }: SegmentedProps<T>) {
  const isNavigation = options.every((option) => option.to);
  const trackClass = cx("inline-flex gap-0.5 rounded-full bg-ink/7 p-1", className);
  const items = options.map((option) => {
    const selected = option.value === value;
    const itemClass = cx(
      "relative inline-flex h-[38px] flex-1 items-center justify-center rounded-full px-4 text-[14px] font-medium whitespace-nowrap",
      selected ? "text-ink" : "text-copy",
    );
    const inner = (
      <>
        {selected ? <motion.span layoutId="segment-highlight" transition={springs.ui} className="absolute inset-0 rounded-full bg-paper shadow-button" /> : null}
        <span className="relative">{option.label}</span>
      </>
    );
    return option.to ? (
      <Link key={option.value} to={option.to} lang={option.lang} aria-label={option.ariaLabel} aria-current={selected ? "page" : undefined} className={itemClass}>
        {inner}
      </Link>
    ) : (
      <button key={option.value} type="button" lang={option.lang} aria-label={option.ariaLabel} aria-pressed={selected} onClick={() => onChange?.(option.value)} className={itemClass}>
        {inner}
      </button>
    );
  });
  return (
    <LayoutGroup id={id}>
      {isNavigation ? (
        <nav aria-label={label} className={trackClass}>
          {items}
        </nav>
      ) : (
        <div role="group" aria-label={label} className={trackClass}>
          {items}
        </div>
      )}
    </LayoutGroup>
  );
}
