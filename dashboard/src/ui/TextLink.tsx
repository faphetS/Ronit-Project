import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "../lib/cx";
import type { SurfaceVariant } from "./Surface";

interface TextLinkProps {
  children: ReactNode;
  /** A page in the app. */
  to?: string;
  /** An address outside the app. */
  href?: string;
  /** Without a destination it is a button that looks like a link. */
  onClick?: () => void;
  size?: "md" | "sm" | "xs";
  surface?: SurfaceVariant;
  className?: string;
}

const SIZE = { md: "text-body", sm: "text-small", xs: "text-caption" } as const;

/** Underlined text link, like "לכל הלידים". The ::after pad gives it a 44px tall touch target without moving anything. */
export function TextLink({ children, to, href, onClick, size = "sm", surface = "card", className }: TextLinkProps) {
  const classes = cx(
    "relative font-medium underline underline-offset-4 transition-colors after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']",
    surface === "ink" ? "text-cream decoration-white/35 hover:decoration-cream focus-visible:outline-cream" : "text-ink decoration-ink/30 hover:decoration-ink",
    SIZE[size],
    className,
  );
  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
