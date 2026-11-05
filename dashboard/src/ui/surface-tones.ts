import type { SurfaceVariant } from "./Surface";

/** The divider between rows on each surface. */
export const DIVIDER: Record<SurfaceVariant, string> = {
  card: "border-line",
  glass: "border-ink/8",
  ink: "border-white/10",
};

/** Titles and values. */
export const STRONG_TEXT: Record<SurfaceVariant, string> = {
  card: "text-ink",
  glass: "text-ink",
  ink: "text-cream",
};

/** Body text. */
export const BODY_TEXT: Record<SurfaceVariant, string> = {
  card: "text-copy",
  glass: "text-copy",
  ink: "text-ink-text",
};

/** Secondary text: at least 5:1 on white and glass, and on ink. */
export const MUTE_TEXT: Record<SurfaceVariant, string> = {
  card: "text-mute",
  glass: "text-mute",
  ink: "text-ink-mute",
};

/** A link or button row under the mouse: a soft tint that eases in. */
export const HOVER_TINT: Record<SurfaceVariant, string> = {
  card: "hover:bg-sand-light/60",
  glass: "hover:bg-white/50",
  ink: "hover:bg-white/6",
};

/** The focus ring must stay visible on the black card. */
export const FOCUS_RING: Record<SurfaceVariant, string> = {
  card: "",
  glass: "",
  ink: "focus-visible:outline-cream",
};
