import { motion, useMotionValue, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { useDirection } from "../content/locale";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { MotionLink } from "./MotionLink";

interface GooButtonProps {
  children: ReactNode;
  /** A page inside the app. */
  to?: string;
  /** An address outside the app, opened in a new window. Say so in the children for screen readers. */
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "dark" | "light";
  size?: "md" | "sm";
  icon?: IconName;
  disabled?: boolean;
  className?: string;
}

// On hover the circle leans forward: to the left in Hebrew, to the right in English.
const CIRCLE_MOTION = {
  rtl: { rest: { x: 0 }, hover: { x: -4 } },
  ltr: { rest: { x: 0 }, hover: { x: 4 } },
};

/** The space between the pill and the circle at rest (gap-2). */
const GAP = 8;

const SIZES = {
  md: { pill: "h-[46px] px-[22px]", circle: "size-[52px]", text: "text-[15px]", pillRadius: 23, circleRadius: 26, fillet: 12 },
  sm: { pill: "h-[38px] px-4", circle: "size-11", text: "text-[14px]", pillRadius: 19, circleRadius: 22, fillet: 10 },
};

const TONES = {
  dark: { fill: "bg-ink text-cream group-hover:bg-black", paint: "fill-ink group-hover:fill-black" },
  light: { fill: "bg-cream text-ink group-hover:bg-white", paint: "fill-cream group-hover:fill-white" },
};

/**
 * The bridge between the pill's round end and the circle, drawn from the pill toward the circle in a box whose
 * end edge runs through the circle's center. Two fillets touch both shapes, so the joint flows like one drop of
 * ink, and it thins as the circle leans away.
 */
function bridge(pillRadius: number, circleRadius: number, gap: number, fillet: number, width: number): string {
  const middle = circleRadius;
  const centers = pillRadius + gap + circleRadius;
  const pillCenter = width - centers;
  // The upper fillet's center: `pillRadius + fillet` from the pill end's center, `circleRadius + fillet` from the circle's.
  const toPill = pillRadius + fillet;
  const toCircle = circleRadius + fillet;
  const along = (toPill ** 2 - toCircle ** 2 + centers ** 2) / (2 * centers);
  const rise = Math.sqrt(Math.max(toPill ** 2 - along ** 2, 0));
  // Where the fillet touches each shape: on the line from that shape's center to the fillet's.
  const pillX = pillCenter + (along * pillRadius) / toPill;
  const pillY = (rise * pillRadius) / toPill;
  const circleX = width - ((centers - along) * circleRadius) / toCircle;
  const circleY = (rise * circleRadius) / toCircle;
  return (
    `M ${pillX} ${middle - pillY} A ${fillet} ${fillet} 0 0 0 ${circleX} ${middle - circleY} ` +
    `L ${circleX} ${middle + circleY} A ${fillet} ${fillet} 0 0 0 ${pillX} ${middle + pillY} Z`
  );
}

/** The primary action: a pill joined to a circle with an arrow, like the reference. */
export function GooButton({ children, to, href, onClick, type = "button", tone = "dark", size = "md", icon = "forward", disabled, className }: GooButtonProps) {
  const direction = useDirection();
  const shape = SIZES[size];
  const colors = TONES[tone];
  const lean = useMotionValue(0);
  // From the circle's center back past the pill end's center, with room for the lean.
  const width = shape.pillRadius + 2 * GAP + shape.circleRadius;
  const neck = useTransform(lean, (x) => bridge(shape.pillRadius, shape.circleRadius, GAP + (direction === "rtl" ? -x : x), shape.fillet, width));
  const content = (
    <>
      <span className={cx("inline-flex items-center rounded-full transition-colors", shape.pill, colors.fill)}>{children}</span>
      <motion.span
        variants={CIRCLE_MOTION[direction]}
        transition={springs.ui}
        style={{ x: lean }}
        className={cx("relative grid shrink-0 place-items-center rounded-full transition-colors", shape.circle, colors.fill)}
      >
        <svg aria-hidden="true" width={width} height={2 * shape.circleRadius} className="pointer-events-none absolute end-1/2 top-0 overflow-visible rtl:-scale-x-100">
          <motion.path d={neck} className={cx("transition-colors", colors.paint)} />
        </svg>
        <Icon name={icon} size={16} />
      </motion.span>
    </>
  );
  const shared = {
    className: cx("group inline-flex items-center gap-2 font-medium leading-none whitespace-nowrap disabled:opacity-50", shape.text, className),
    initial: "rest",
    whileHover: "hover",
    whileTap: { scale: PRESS_SCALE },
    transition: springs.ui,
  } as const;
  if (href) {
    return (
      <motion.a href={href} target="_blank" rel="noreferrer" {...shared}>
        {content}
      </motion.a>
    );
  }
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
