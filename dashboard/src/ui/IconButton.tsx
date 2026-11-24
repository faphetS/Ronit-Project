import { motion } from "motion/react";
import type { Ref } from "react";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { CountBadge } from "./CountBadge";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { MotionLink } from "./MotionLink";

interface IconButtonProps {
  icon: IconName;
  /** Accessible name. Include any count the badge shows. */
  label: string;
  to?: string;
  onClick?: () => void;
  badge?: number;
  tone?: "glass" | "ink" | "paper";
  size?: "md" | "sm";
  className?: string;
  /** For a button that opens a panel: the kind of panel, and whether it is open. */
  popup?: { kind: "dialog"; expanded: boolean };
  /** Reaches the button element (not the link), e.g. to bring the focus back to it. */
  ref?: Ref<HTMLButtonElement>;
}

const TONE = {
  glass: "surface-glass text-ink hover:bg-white",
  ink: "bg-ink text-cream hover:bg-black",
  paper: "bg-sand-light text-ink hover:bg-white",
} as const;

/** Round icon-only control. */
export function IconButton({ icon, label, to, onClick, badge, tone = "glass", size = "md", className, popup, ref }: IconButtonProps) {
  const classes = cx("relative grid shrink-0 place-items-center rounded-full transition-colors", size === "md" ? "size-12" : "size-10", TONE[tone], className);
  const content = (
    <>
      <Icon name={icon} />
      {badge ? <CountBadge count={badge} /> : null}
    </>
  );
  return to ? (
    <MotionLink to={to} aria-label={label} className={classes} whileHover={{ y: -1 }} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui}>
      {content}
    </MotionLink>
  ) : (
    <motion.button
      ref={ref}
      type="button"
      aria-label={label}
      aria-haspopup={popup?.kind}
      aria-expanded={popup?.expanded}
      onClick={onClick}
      className={classes}
      whileHover={{ y: -1 }}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
    >
      {content}
    </motion.button>
  );
}
