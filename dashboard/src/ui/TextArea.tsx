import { motion } from "motion/react";
import { useId, useImperativeHandle, useRef, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref, type SyntheticEvent } from "react";
import { useCopy } from "../content/locale";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { Icon } from "./Icon";

export interface TextToken {
  /** The chip's text: "שם פרטי". */
  label: string;
  /** What it inserts: "{שם פרטי}". */
  token: string;
}

/** A field that suggests as it's typed into: it is a combobox for the listbox with the id `controls`. */
export interface TextAreaCombobox {
  expanded: boolean;
  controls: string;
  /** The id of the suggestion picked with the arrow keys, while the list is open. */
  activeDescendant?: string;
}

interface TextAreaProps {
  label: string;
  /** Show the label above the field, small and muted. Otherwise it is for screen readers only. */
  showLabel?: boolean;
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Visible lines: 5 for a message template, 3 for a note. */
  rows?: number;
  /** Use on white cards instead of glass, like Field. */
  onPaper?: boolean;
  /** Chips under the field that insert a token where the cursor is (at the end if the field was never touched). */
  tokens?: TextToken[];
  /** Controls at the end of the chips row, like a save button. */
  actions?: ReactNode;
  /** Id of text that describes the field, like a character count. */
  describedBy?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Reaches the textarea itself, e.g. to read or move the caret. */
  ref?: Ref<HTMLTextAreaElement>;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** The caret moved or the selection changed: by typing, a click or the arrow keys. */
  onSelect?: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  combobox?: TextAreaCombobox;
  /** Floats right under the field, over what follows: a list of suggestions. */
  popup?: ReactNode;
}

/** Multiline field in the same family as Field: soft fill, rounded corners, a dark focus ring. */
export function TextArea({
  label,
  showLabel = false,
  name,
  value,
  defaultValue,
  onChange,
  placeholder,
  rows = 4,
  onPaper = false,
  tokens,
  actions,
  describedBy,
  maxLength,
  required,
  disabled,
  className,
  ref,
  onKeyDown,
  onSelect,
  onBlur,
  combobox,
  popup,
}: TextAreaProps) {
  const id = useId();
  const { uiCopy } = useCopy();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Handed out again each render: the field remounts if `popup` comes or goes.
  useImperativeHandle(ref, () => fieldRef.current as HTMLTextAreaElement);
  // Where the cursor was when the field last had it, so a chip inserts there.
  const lastSelection = useRef<[number, number] | null>(null);

  const remember = () => {
    const field = fieldRef.current;
    if (field) lastSelection.current = [field.selectionStart, field.selectionEnd];
  };

  const insert = (token: string) => {
    const field = fieldRef.current;
    if (!field) return;
    const [start, end] = lastSelection.current ?? [field.value.length, field.value.length];
    field.setRangeText(token, start, end, "end");
    lastSelection.current = [field.selectionStart, field.selectionEnd];
    onChange?.(field.value);
    field.focus();
  };

  const hasRow = Boolean(tokens?.length) || Boolean(actions);
  const field = (
    <textarea
      ref={fieldRef}
      id={id}
      name={name}
      rows={rows}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      onKeyDown={onKeyDown}
      onSelect={(event) => {
        remember();
        onSelect?.(event);
      }}
      onBlur={(event) => {
        remember();
        onBlur?.(event);
      }}
      placeholder={placeholder}
      maxLength={maxLength}
      required={required}
      disabled={disabled}
      aria-describedby={describedBy}
      role={combobox ? "combobox" : undefined}
      aria-autocomplete={combobox ? "list" : undefined}
      aria-expanded={combobox?.expanded}
      aria-controls={combobox?.controls}
      aria-activedescendant={combobox?.activeDescendant}
      className={cx(
        "block w-full resize-y rounded-inner px-[18px] py-3.5 text-[15px] leading-[1.7] text-ink placeholder:text-mute focus-visible:outline-offset-2 disabled:opacity-60",
        onPaper ? "bg-sand-light" : "bg-white/60",
      )}
    />
  );
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className={showLabel ? "text-[13px] font-medium text-mute" : "sr-only"}>
        {label}
      </label>
      {popup ? (
        <div className="relative">
          {field}
          {popup}
        </div>
      ) : (
        field
      )}
      {hasRow ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {tokens?.length ? (
            <div role="group" aria-label={uiCopy.personalFields} className="flex flex-wrap gap-2">
              {tokens.map((item) => (
                <motion.button
                  key={item.token}
                  type="button"
                  aria-label={uiCopy.insertField(item.label)}
                  disabled={disabled}
                  onClick={() => insert(item.token)}
                  whileTap={{ scale: PRESS_SCALE }}
                  transition={springs.ui}
                  className={cx(
                    "inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap text-copy disabled:opacity-50 lg:h-10",
                    onPaper ? "bg-sand-light hover:bg-sand" : "bg-white/55 ring-1 ring-white/85 ring-inset hover:bg-white",
                  )}
                >
                  <Icon name="plus" size={14} />
                  {item.label}
                </motion.button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
