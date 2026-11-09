import { useId, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

interface FieldProps {
  label: string;
  icon: IconName;
  name: string;
  type?: "text" | "email" | "password" | "search" | "tel";
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Inline action at the end, like the "שכחתי" pill. */
  trailing?: ReactNode;
  size?: "md" | "sm";
  /** Use on white cards instead of glass. */
  onPaper?: boolean;
  inputMode?: "text" | "numeric" | "email" | "tel";
  maxLength?: number;
  autoFocus?: boolean;
  /** The direction of what's typed, e.g. "ltr" for a code in the Hebrew layout. */
  dir?: "ltr" | "rtl" | "auto";
  /** Off for usernames and passwords, so what's typed isn't underlined or sent to a spelling service. */
  spellCheck?: boolean;
  className?: string;
}

/** Pill input with a round icon at the start. The label is for screen readers; the placeholder shows it. */
export function Field({
  label,
  icon,
  name,
  type = "text",
  placeholder,
  autoComplete,
  required,
  value,
  defaultValue,
  onChange,
  trailing,
  size = "md",
  onPaper = false,
  inputMode,
  maxLength,
  autoFocus,
  dir,
  spellCheck,
  className,
}: FieldProps) {
  const id = useId();
  return (
    <div
      className={cx(
        "flex items-center gap-2.5 rounded-full px-1.5 focus-within:ring-2 focus-within:ring-ink",
        size === "md" ? "h-[54px]" : "h-12",
        onPaper ? "bg-sand-light" : "bg-white/45 ring-1 ring-inset ring-white/80",
        className,
      )}
    >
      <span aria-hidden="true" className={cx("grid shrink-0 place-items-center rounded-full text-ink", size === "md" ? "size-[42px]" : "size-9", onPaper ? "bg-paper" : "bg-white/75")}>
        <Icon name={icon} size={16} />
      </span>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder ?? label}
        autoComplete={autoComplete}
        required={required}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        inputMode={inputMode}
        maxLength={maxLength}
        autoFocus={autoFocus}
        dir={dir}
        spellCheck={spellCheck}
        className="h-full min-w-0 flex-1 bg-transparent px-1 text-[15px] text-ink outline-none placeholder:text-mute"
      />
      {trailing}
    </div>
  );
}
