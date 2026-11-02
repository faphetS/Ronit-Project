import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { cx } from "../lib/cx";
import { Avatar, type AvatarTone } from "./Avatar";

interface PersonCellProps {
  name: string;
  initial: string;
  /** A small muted second line, like the lead's last note. */
  detail?: ReactNode;
  /** Makes the name a link. It gets aria-current while its page is open. */
  to?: string;
  gold?: boolean;
  avatarTone?: AvatarTone;
  /** Muted name, for someone who has not joined yet. */
  muted?: boolean;
  className?: string;
}

/** Avatar and name, the first cell of most tables. With a destination it is the row's link. */
export function PersonCell({ name, initial, detail, to, gold = false, avatarTone, muted = false, className }: PersonCellProps) {
  const content = (
    <>
      <Avatar initial={initial} gold={gold} tone={avatarTone} />
      <span className="min-w-0 text-start">
        <span className={cx("block", to && "underline-offset-3 group-hover/person:underline")}>{name}</span>
        {detail ? <span className="block text-caption font-normal text-mute">{detail}</span> : null}
      </span>
    </>
  );
  const classes = cx("inline-flex items-center gap-2.5 font-medium", muted ? "text-mute" : "text-ink", className);
  return to ? (
    <NavLink to={to} className={cx("group/person", classes)}>
      {content}
    </NavLink>
  ) : (
    <span className={classes}>{content}</span>
  );
}
