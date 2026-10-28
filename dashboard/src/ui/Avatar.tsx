import { cx } from "../lib/cx";

type AvatarSize = "sm" | "md" | "lg";

const SIZE: Record<AvatarSize, string> = {
  sm: "size-[38px] text-[14px] font-semibold",
  md: "size-[46px] text-[18px] font-semibold",
  lg: "size-[76px] text-[30px] font-light",
};

interface AvatarProps {
  initial: string;
  gold?: boolean;
  size?: AvatarSize;
  className?: string;
}

/** An initial in a circle. Decorative: the name is always next to it or on the control around it. */
export function Avatar({ initial, gold = false, size = "sm", className }: AvatarProps) {
  return (
    <span aria-hidden="true" className={cx("grid shrink-0 place-items-center rounded-full", SIZE[size], gold ? "avatar-gold" : "bg-sand text-ink", className)}>
      {initial}
    </span>
  );
}
