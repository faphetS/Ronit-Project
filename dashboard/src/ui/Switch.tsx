import { motion } from "motion/react";
import { cx } from "../lib/cx";
import { springs } from "../motion/springs";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onDark?: boolean;
}

/** On/off switch. In RTL the knob rests on the right and slides left when on. */
export function Switch({ checked, onChange, label, onDark = false }: SwitchProps) {
  const track = checked ? (onDark ? "bg-gold" : "bg-ink") : onDark ? "bg-white/20" : "bg-ink/16";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-8 w-[52px] shrink-0 rounded-full transition-colors", track)}
    >
      <motion.span
        aria-hidden="true"
        animate={{ x: checked ? -20 : 0 }}
        transition={springs.ui}
        className="absolute start-[3px] top-[3px] size-[26px] rounded-full bg-paper shadow-knob"
      />
    </button>
  );
}
