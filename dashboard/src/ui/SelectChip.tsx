import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import type { SurfaceVariant } from "./Surface";

export interface SelectChipOption<T extends string> {
  value: T;
  label: string;
}

interface SelectChipProps<T extends string> {
  /** What it filters, for screen readers: "מקור". The chip shows the chosen option. */
  label: string;
  /** The first option is the "all" choice: "כל המקורות". Any other choice shows the chip as active. */
  options: SelectChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** "glass" on the page (the default), "card" on white cards. */
  surface?: SurfaceVariant;
  className?: string;
}

/**
 * A filter chip with a menu, like "כל המקורות ▾". A native select underneath, so it works with the keyboard,
 * screen readers and the phone's own picker. Dark while a choice other than the first is active.
 */
export function SelectChip<T extends string>({ label, options, value, onChange, surface = "glass", className }: SelectChipProps<T>) {
  const active = value !== options[0]?.value;
  const rest = surface === "card" ? "bg-sand-light text-copy hover:bg-sand" : "bg-white/55 text-copy ring-1 ring-white/85 ring-inset hover:bg-white";
  return (
    <span className={cx("relative inline-flex shrink-0", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.target.value);
          if (chosen) onChange(chosen.value);
        }}
        className={cx(
          "h-11 cursor-pointer appearance-none rounded-full ps-4 pe-10 text-[14px] font-medium whitespace-nowrap transition-colors lg:h-10",
          active ? "bg-ink text-cream" : rest,
        )}
      >
        {options.map((option) => (
          // Options keep their own colors: some systems paint the open list with the select's colors.
          <option key={option.value} value={option.value} className="bg-paper text-ink">
            {option.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className={cx("pointer-events-none absolute inset-y-0 end-3.5 flex items-center", active ? "text-cream" : "text-copy")}>
        <Icon name="chevronDown" size={16} />
      </span>
    </span>
  );
}
