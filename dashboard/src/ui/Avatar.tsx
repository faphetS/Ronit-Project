import { cx } from "../lib/cx";

type AvatarSize = "sm" | "md" | "lg" | "xl";

/** The circle's look on each surface. "outline" is for someone who has not joined yet, like a pending invite. */
export type AvatarTone = "sand" | "glass" | "ink" | "paper" | "outline";

const SIZE: Record<AvatarSize, string> = {
  sm: "size-[38px] text-[14px] font-semibold",
  md: "size-[46px] text-[18px] font-semibold",
  lg: "size-[76px] text-[30px] font-light",
  xl: "size-[96px] text-[38px] font-light",
};

const TONE: Record<AvatarTone, string> = {
  sand: "bg-sand text-ink",
  glass: "bg-white/75 text-ink",
  ink: "bg-white/10 text-cream",
  paper: "bg-paper text-ink",
  outline: "text-mute ring-1 ring-inset ring-mute/25",
};

interface AvatarProps {
  initial: string;
  gold?: boolean;
  /** Use "glass" on glass, "ink" on black cards, "paper" on sand. Ignored when gold. */
  tone?: AvatarTone;
  size?: AvatarSize;
  className?: string;
}

/** An initial in a circle. Decorative: the name is always next to it or on the control around it. */
export function Avatar({ initial, gold = false, tone = "sand", size = "sm", className }: AvatarProps) {
  return (
    <span aria-hidden="true" className={cx("grid shrink-0 place-items-center rounded-full", SIZE[size], gold ? "avatar-gold" : TONE[tone], className)}>
      {initial}
    </span>
  );
}
