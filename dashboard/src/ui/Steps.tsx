import { useCopy } from "../content/locale";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import type { SurfaceVariant } from "./Surface";

export type StepState = "done" | "current" | "upcoming";

export interface StepItem {
  key: string;
  label: string;
  /** Small muted text at the end of a vertical step, like "4 לוחות". */
  note?: string;
  state: StepState;
}

interface StepsProps {
  steps: StepItem[];
  /** Names the list: "שלבי הייבוא". */
  label: string;
  orientation?: "horizontal" | "vertical";
  /** Horizontal steps inside a glass pill, like the greeting's stage pill bar. */
  pill?: boolean;
  surface?: SurfaceVariant;
  className?: string;
}

/**
 * Numbered steps: done ones show a check, the current one is a white pill with a gold number and
 * aria-current="step", upcoming ones are muted. Screen readers also hear "הושלם" after a done step.
 */
export function Steps({ steps, label, orientation = "horizontal", pill = false, surface = "card", className }: StepsProps) {
  const { uiCopy } = useCopy();
  const dark = surface === "ink";
  const vertical = orientation === "vertical";
  return (
    <ol
      aria-label={label}
      className={cx(
        vertical ? "flex flex-col gap-0.5" : "flex flex-wrap items-center gap-1.5",
        pill && !vertical && "surface-glass self-start rounded-full p-[5px]",
        className,
      )}
    >
      {steps.map((step, index) => {
        const done = step.state === "done";
        const current = step.state === "current";
        return (
          <li
            key={step.key}
            aria-current={current ? "step" : undefined}
            className={cx(
              "flex h-[42px] items-center gap-2 rounded-full text-[14px] font-medium whitespace-nowrap",
              vertical ? "px-2.5" : "ps-2.5 pe-4",
              current ? "bg-paper text-ink shadow-button" : done ? (dark ? "text-cream" : "text-ink") : dark ? "text-ink-mute" : "text-mute",
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                "grid size-[26px] shrink-0 place-items-center rounded-full text-[12.5px] font-semibold",
                current ? "bg-gold text-ink" : done ? (dark ? "bg-cream text-ink" : "bg-ink text-cream") : dark ? "bg-white/12 text-cream" : "bg-ink/8 text-copy",
              )}
            >
              {done ? <Icon name="check" size={16} /> : index + 1}
            </span>
            <span>{step.label}</span>
            {done ? <span className="sr-only">{`, ${uiCopy.stepDone}`}</span> : null}
            {step.note ? (
              <span className={cx("min-w-0 flex-1 truncate text-end text-caption font-normal", current ? "text-mute" : dark ? "text-ink-mute" : "text-mute")}>{step.note}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
