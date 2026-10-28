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
  /** One line that scrolls sideways and runs to the screen edges, as on phones. Otherwise the chips wrap. */
  scroll?: boolean;
  className?: string;
}

/** Single-choice filter chips. The dark highlight glides to the chosen chip. 44px tall on phones, 40px from lg. */
export function ChipGroup<T extends string>({ id, label, options, value, onChange, onPaper = false, scroll = false, className }: ChipGroupProps<T>) {
  return (
    <LayoutGroup id={id}>
      <div
        role="group"
        aria-label={label}
        className={cx("flex gap-2", scroll ? "no-scrollbar -mx-4 overflow-x-auto px-4 pt-0.5 pb-1.5" : "flex-wrap", className)}
      >
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
                "relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-medium whitespace-nowrap lg:h-10",
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
