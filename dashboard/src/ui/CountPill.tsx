import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import type { SurfaceVariant } from "./Surface";

interface CountPillProps {
  children: ReactNode;
  /** Read instead of the bare number, like "5 לידים". */
  label?: string;
  surface?: SurfaceVariant;
  className?: string;
}

/** A small count beside a heading or a group name: the "5" next to פולין · נובמבר. */
export function CountPill({ children, label, surface = "card", className }: CountPillProps) {
  return (
    <span
      className={cx(
        "inline-grid h-[22px] min-w-6 place-items-center rounded-full px-[7px] text-[12px] leading-none font-semibold whitespace-nowrap",
        surface === "ink" ? "bg-white/14 text-cream" : "bg-ink/8 text-ink",
        className,
      )}
    >
      {label ? (
        <>
          <span aria-hidden="true">{children}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
