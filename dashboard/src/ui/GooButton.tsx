import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { MotionLink } from "./MotionLink";

interface GooButtonProps {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "dark" | "light";
  size?: "md" | "sm";
  icon?: IconName;
  disabled?: boolean;
  className?: string;
}

// On hover the circle leans forward. Forward is to the left in RTL.
const circleMotion = { rest: { x: 0 }, hover: { x: -4 } };

/** The primary action: a pill joined to a circle with an arrow, like the reference. */
export function GooButton({ children, to, onClick, type = "button", tone = "dark", size = "md", icon = "forward", disabled, className }: GooButtonProps) {
  const fill = tone === "dark" ? "bg-ink text-cream group-hover:bg-black" : "bg-cream text-ink group-hover:bg-white";
  const content = (
    <>
      <span className={cx("inline-flex items-center rounded-full transition-colors", size === "md" ? "h-[46px] px-[22px]" : "h-[38px] px-4", fill)}>{children}</span>
      <motion.span
        variants={circleMotion}
        transition={springs.ui}
        className={cx("goo-neck grid shrink-0 place-items-center rounded-full transition-colors", size === "md" ? "size-[52px]" : "size-11", fill)}
      >
        <Icon name={icon} size={16} />
      </motion.span>
    </>
  );
  const shared = {
    className: cx("group inline-flex items-center gap-2 font-medium leading-none whitespace-nowrap disabled:opacity-50", size === "md" ? "text-[15px]" : "text-[14px]", className),
    initial: "rest",
    whileHover: "hover",
    whileTap: { scale: PRESS_SCALE },
    transition: springs.ui,
  } as const;
  return to ? (
    <MotionLink to={to} {...shared}>
      {content}
    </MotionLink>
  ) : (
    <motion.button type={type} onClick={onClick} disabled={disabled} {...shared}>
      {content}
    </motion.button>
  );
}
