import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { MotionLink } from "./MotionLink";

export type ButtonVariant = "solid" | "outline" | "white";

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: IconName;
  /** Use on black cards. */
  onDark?: boolean;
  to?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}

const SIZE = { md: "h-[46px] px-[22px] text-[15px]", sm: "h-[38px] px-4 text-[14px]" } as const;

const ON_LIGHT: Record<ButtonVariant, string> = {
  solid: "bg-ink text-cream hover:bg-black",
  outline: "text-ink ring-1 ring-inset ring-ink/28 hover:bg-white/65",
  white: "bg-paper text-ink shadow-button",
};

const ON_DARK: Record<ButtonVariant, string> = {
  solid: "bg-cream text-ink hover:bg-white",
  outline: "text-cream ring-1 ring-inset ring-white/30 hover:bg-white/8",
  white: "bg-paper text-ink",
};

/** Pill button. Renders a link when it has a destination. */
export function Button({ children, variant = "solid", size = "md", icon, onDark = false, to, onClick, type = "button", disabled, className }: ButtonProps) {
  const classes = cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium leading-none whitespace-nowrap transition-colors disabled:opacity-50",
    SIZE[size],
    (onDark ? ON_DARK : ON_LIGHT)[variant],
    className,
  );
  const content = (
    <>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </>
  );
  if (to) {
    return (
      <MotionLink to={to} className={classes} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui}>
        {content}
      </MotionLink>
    );
  }
  return (
    <motion.button type={type} onClick={onClick} disabled={disabled} className={classes} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui}>
      {content}
    </motion.button>
  );
}
