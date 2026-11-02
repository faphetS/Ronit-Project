import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import type { SurfaceVariant } from "./Surface";
import { MUTE_TEXT, STRONG_TEXT } from "./surface-tones";

interface SectionHeaderProps {
  title: ReactNode;
  /** A small muted line under the title. */
  subtitle?: ReactNode;
  /** Right after the title: a CountPill or a StatusTag. */
  titleAddon?: ReactNode;
  /** At the end: a TextLink, a StatusTag, an icon, or short text (a string shows small and muted). */
  trailing?: ReactNode;
  level?: 2 | 3;
  /** Id for the heading, so a section can point aria-labelledby at it. */
  id?: string;
  surface?: SurfaceVariant;
  /** Drop the 12px space under the header, when the parent already spaces its children. */
  flush?: boolean;
  className?: string;
}

/** A card's title row: title (and an addon) at the start, a link, tag or note at the end. Works above a card too. */
export function SectionHeader({ title, subtitle, titleAddon, trailing, level = 2, id, surface = "card", flush = false, className }: SectionHeaderProps) {
  const Heading = level === 2 ? "h2" : "h3";
  const muted = cx("text-caption", MUTE_TEXT[surface]);
  return (
    <div className={cx("flex items-center justify-between gap-3", !flush && "mb-3", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Heading id={id} className={cx("text-title font-medium", STRONG_TEXT[surface])}>
            {title}
          </Heading>
          {titleAddon}
        </div>
        {subtitle ? <p className={muted}>{subtitle}</p> : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center">{typeof trailing === "string" ? <span className={muted}>{trailing}</span> : trailing}</div> : null}
    </div>
  );
}
