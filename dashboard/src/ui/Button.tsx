import { motion } from "motion/react";
import type { ReactNode, Ref } from "react";
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
  /** Reaches the button element (not the link), e.g. to focus it first in a dialog. */
  ref?: Ref<HTMLButtonElement>;
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
export function Button({ children, variant = "solid", size = "md", icon, onDark = false, to, onClick, type = "button", disabled, className, ref }: ButtonProps) {
  const classes = cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium leading-none whitespace-nowrap transition-colors disabled:opacity-50",
    SIZE[size],
    (onDark ? ON_DARK : ON_LIGHT)[variant],
    onDark && "focus-visible:outline-cream",
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
      <MotionLink to={to} className={classes} whileHover={{ y: -1 }} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui}>
        {content}
      </MotionLink>
    );
  }
  return (
    <motion.button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classes}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
    >
      {content}
    </motion.button>
  );
}
