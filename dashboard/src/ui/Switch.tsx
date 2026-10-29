import { motion } from "motion/react";
import { useDirection } from "../content/locale";
import { cx } from "../lib/cx";
import { springs } from "../motion/springs";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onDark?: boolean;
}

// The ::after extends the touch target to 44px tall without changing the look.
const TRACK = "relative h-8 w-[52px] shrink-0 rounded-full transition-colors after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']";

/** On/off switch. The knob rests at the start side and slides toward the end when on: leftward in Hebrew, rightward in English. */
export function Switch({ checked, onChange, label, onDark = false }: SwitchProps) {
  const travel = useDirection() === "rtl" ? -20 : 20;
  const fill = checked ? (onDark ? "bg-gold" : "bg-ink") : onDark ? "bg-white/20" : "bg-ink/16";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(TRACK, fill, onDark && "focus-visible:outline-cream")}
    >
      <motion.span
        aria-hidden="true"
        animate={{ x: checked ? travel : 0 }}
        transition={springs.ui}
        className="absolute start-[3px] top-[3px] size-[26px] rounded-full bg-paper shadow-knob"
      />
    </button>
  );
}
