import { ICONS, type IconName, type IconShape } from "./icons";

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
      className={className}
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
