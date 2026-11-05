import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "../lib/cx";
import type { RowMotion } from "../motion/cascade";
import { rowVariants } from "../motion/variants";
import { Icon } from "./Icon";
import type { SurfaceVariant } from "./Surface";
import { BODY_TEXT, DIVIDER, FOCUS_RING, HOVER_TINT, MUTE_TEXT, STRONG_TEXT } from "./surface-tones";

interface ListRowProps {
  title: ReactNode;
  /** A small muted line under the title. */
  description?: ReactNode;
  /** A third small line in body color, like the last note and when. */
  note?: ReactNode;
  /** At the start: an Avatar, an IconCircle, or a date column. */
  leading?: ReactNode;
  /** At the end: a StatusTag, a time, a Switch or a button. */
  trailing?: ReactNode;
  /** On the title's line, at the end, like the status tag in the phone leads list. */
  titleEnd?: ReactNode;
  /** The whole row links here. */
  to?: string;
  /** The whole row is a button. */
  onClick?: () => void;
  /** A forward arrow at the end, for link rows on phones. */
  chevron?: boolean;
  /** "start" when the row has more than one line beside an avatar. */
  align?: "center" | "start";
  /** The surface the list sits on, for the divider and text colors. */
  surface?: SurfaceVariant;
  /** "li" inside a <ul> or <ol>. */
  as?: "li" | "div";
  /** "strong" (default): medium weight, dark. "body": regular text, for a setting beside a Switch. "muted": someone who has not joined yet. */
  titleTone?: "strong" | "body" | "muted";
  /** Size classes for the title, like "text-small" on phones. Use titleTone for color and weight. */
  titleClassName?: string;
  /** Settles with its list as the page opens: its place, and whether it cascades (see useFirstKeys). */
  row?: RowMotion;
  className?: string;
}

/**
 * One row of a list: lines between rows, the first without one. Link and button rows tint and underline their title on
 * hover. With `row`, it settles with its list as the page opens.
 */
export function ListRow({
  title,
  description,
  note,
  leading,
  trailing,
  titleEnd,
  to,
  onClick,
  chevron = false,
  align = "center",
  surface = "card",
  as: Outer = "div",
  titleTone = "strong",
  titleClassName,
  row,
  className,
}: ListRowProps) {
  const interactive = Boolean(to || onClick);
  const tone = { strong: cx("font-medium", STRONG_TEXT[surface]), body: BODY_TEXT[surface], muted: cx("font-medium", MUTE_TEXT[surface]) }[titleTone];
  const titleElement = (
    <span className={cx("block", tone, interactive && "underline-offset-3 group-hover/row:underline", titleClassName)}>{title}</span>
  );
  // Spans only: a button may hold phrasing content only.
  const body = (
    <>
      {leading}
      <span className="block min-w-0 flex-1">
        {titleEnd ? (
          <span className="flex items-center justify-between gap-2">
            {titleElement}
            {titleEnd}
          </span>
        ) : (
          titleElement
        )}
        {description ? <span className={cx("block text-caption", MUTE_TEXT[surface])}>{description}</span> : null}
        {note ? <span className={cx("mt-1 block text-caption", BODY_TEXT[surface])}>{note}</span> : null}
      </span>
      {trailing}
      {chevron ? <Icon name="forward" size={16} className={cx("shrink-0", MUTE_TEXT[surface])} /> : null}
    </>
  );
  const baseRow = cx("flex gap-3 py-3", align === "start" ? "items-start" : "items-center");
  const rowClass = cx(baseRow, "w-full");
  // Link and button rows tint under the mouse, a little past their edges so the tint isn't tight on the avatar.
  const interactiveClass = cx(baseRow, "-mx-2.5 w-[calc(100%+1.25rem)] rounded-[14px] px-2.5 transition-colors", HOVER_TINT[surface]);
  const outerClass = cx("border-t first:border-t-0", DIVIDER[surface], className);
  const inner = to ? (
    <Link to={to} className={cx("group/row", interactiveClass, FOCUS_RING[surface])}>
      {body}
    </Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className={cx("group/row text-start", interactiveClass, FOCUS_RING[surface])}>
      {body}
    </button>
  ) : (
    <div className={rowClass}>{body}</div>
  );
  if (row) {
    const MotionOuter = Outer === "li" ? motion.li : motion.div;
    return (
      <MotionOuter variants={rowVariants} custom={row} className={outerClass}>
        {inner}
      </MotionOuter>
    );
  }
  return <Outer className={outerClass}>{inner}</Outer>;
}
