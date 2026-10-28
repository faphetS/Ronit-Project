import { LayoutGroup, motion } from "motion/react";
import { cx } from "../lib/cx";
import { formatNumber } from "../lib/format";
import { PRESS_SCALE, springs } from "../motion/springs";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface ChipGroupProps<T extends string> {
  /** Unique per group on a screen, so the highlight glides only inside this group. */
  id: string;
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onPaper?: boolean;
  className?: string;
}

/** Single-choice filter chips. The dark highlight glides to the chosen chip. */
export function ChipGroup<T extends string>({ id, label, options, value, onChange, onPaper = false, className }: ChipGroupProps<T>) {
  return (
    <LayoutGroup id={id}>
      <div role="group" aria-label={label} className={cx("flex flex-wrap gap-2", className)}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <motion.button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              whileTap={{ scale: PRESS_SCALE }}
              transition={springs.ui}
              className={cx(
                "relative inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium whitespace-nowrap",
                selected ? "text-cream" : cx("text-copy", onPaper ? "bg-sand-light" : "bg-white/55 ring-1 ring-inset ring-white/85 hover:bg-white"),
              )}
            >
              {selected ? <motion.span layoutId="chip-highlight" transition={springs.ui} className="absolute inset-0 rounded-full bg-ink" /> : null}
              <span className="relative">{option.label}</span>
              {option.count === undefined ? null : (
                <>
                  {" "}
                  <span className={cx("relative font-normal", selected ? "text-ink-mute" : "text-mute")}>{formatNumber(option.count)}</span>
                </>
              )}
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
