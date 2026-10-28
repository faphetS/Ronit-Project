import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

/** The circle's look: one per surface ("sand" on white cards), plus "solid" (black) and "outline" for yes/no marks. */
export type IconCircleTone = "sand" | "glass" | "ink" | "paper" | "solid" | "outline";

const TONE: Record<IconCircleTone, string> = {
  sand: "bg-sand text-ink",
  glass: "bg-white/75 text-ink",
  ink: "bg-white/10 text-cream",
  paper: "bg-paper text-ink",
  solid: "bg-ink text-cream",
  outline: "text-mute ring-1 ring-inset ring-mute/25",
};

const SIZE = { sm: "size-[30px]", md: "size-[38px]", lg: "size-[42px]" } as const;

interface IconCircleProps {
  icon: IconName;
  tone?: IconCircleTone;
  /** 30px for marks in a table, 38px, or 42px (the default) beside a row. */
  size?: keyof typeof SIZE;
  iconSize?: number;
  /** Only when the icon carries meaning on its own, like "גישה מלאה" in the permission matrix. Otherwise it is hidden. */
  label?: string;
  className?: string;
}

/** An icon in a round chip, at the start of a row (activity feed, admin links) or as a yes/no mark. */
export function IconCircle({ icon, tone = "sand", size = "lg", iconSize = 16, label, className }: IconCircleProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx("inline-grid shrink-0 place-items-center rounded-full", TONE[tone], SIZE[size], className)}
    >
      <Icon name={icon} size={iconSize} />
    </span>
  );
}
