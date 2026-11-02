import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "../lib/cx";
import { Meter } from "./Meter";
import type { SurfaceVariant } from "./Surface";
import { DIVIDER, FOCUS_RING, MUTE_TEXT, STRONG_TEXT } from "./surface-tones";

interface MeterRowProps {
  title: ReactNode;
  /** Small muted text beside the title, like "8 קבוצות". */
  detail?: ReactNode;
  /** The figure at the end, usually a BigNumber (size 22 to 26), with a total when there is one. */
  figure?: ReactNode;
  /** The meter's fill, 0 to 1. */
  share: number;
  /** The meter's accessible name, like "32 מתוך 40 נרשמו". */
  meterLabel: string;
  /** A small muted line under the meter. */
  caption?: ReactNode;
  /** The whole row links here. */
  to?: string;
  /** A control at the start, like a checkbox. The row becomes its label. */
  control?: ReactNode;
  surface?: SurfaceVariant;
  /** "li" inside a <ul> or <ol>. */
  as?: "li" | "div";
  className?: string;
}

/** A row with a title, a figure and a meter under them: active groups, boards in the Monday import. */
export function MeterRow({ title, detail, figure, share, meterLabel, caption, to, control, surface = "card", as: Outer = "div", className }: MeterRowProps) {
  const muted = cx("text-caption", MUTE_TEXT[surface]);
  const interactive = Boolean(to || control);
  const content = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          {control}
          <span className={cx("font-medium", STRONG_TEXT[surface], to && "underline-offset-3 group-hover/meter-row:underline")}>{title}</span>
          {detail ? <span className={muted}>{detail}</span> : null}
        </span>
        {figure}
      </span>
      {interactive ? (
        // Inside a link or a label the meter's value would join the control's name; the figure already says it.
        <span aria-hidden="true">
          <Meter value={share} label={meterLabel} onDark={surface === "ink"} />
        </span>
      ) : (
        <Meter value={share} label={meterLabel} onDark={surface === "ink"} />
      )}
      {caption ? <span className={muted}>{caption}</span> : null}
    </>
  );
  // The first row sits closer to the header above it, as on the canvas.
  const innerClass = cx("flex flex-col gap-2 py-3.5 group-first/meter-outer:pt-1", FOCUS_RING[surface]);
  return (
    <Outer className={cx("group/meter-outer border-t first:border-t-0", DIVIDER[surface], className)}>
      {to ? (
        <Link to={to} className={cx("group/meter-row", innerClass)}>
          {content}
        </Link>
      ) : control ? (
        <label className={cx("cursor-pointer", innerClass)}>{content}</label>
      ) : (
        <div className={innerClass}>{content}</div>
      )}
    </Outer>
  );
}
