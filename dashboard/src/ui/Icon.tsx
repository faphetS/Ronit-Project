import { cx } from "../lib/cx";
import { ICONS, type IconName, type IconShape } from "./icons";

// "forward" and "back" are drawn for Hebrew. In English they point the other way.
const FLIP_IN_LTR: ReadonlySet<IconName> = new Set<IconName>(["forward", "back"]);

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** Decorative stroke icon. The control around it carries the accessible name. */
export function Icon({ name, size = 20, className }: IconProps) {
  const shapes = ICONS[name] as readonly IconShape[];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cx(FLIP_IN_LTR.has(name) && "ltr:-scale-x-100", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes.map((shape) =>
        typeof shape === "string" ? (
          <path key={shape} d={shape} />
        ) : (
          <circle key={`${shape.cx},${shape.cy}`} cx={shape.cx} cy={shape.cy} r={shape.r} />
        ),
      )}
    </svg>
  );
}
