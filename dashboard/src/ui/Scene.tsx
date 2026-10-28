import type { CSSProperties } from "react";
import { cx } from "../lib/cx";

type PieceKind = "glow" | "dome" | "pearl" | "pebble";

interface Piece {
  kind: PieceKind;
  width: number;
  height?: number;
  at: CSSProperties;
}

const KIND_CLASS: Record<PieceKind, string> = {
  glow: "scene-glow",
  dome: "scene-dome",
  pearl: "scene-pearl",
  pebble: "scene-pebble",
};

// Positions copy the approved canvas. Inline start is the right edge in RTL.
const PRESETS = {
  app: [
    { kind: "glow", width: 680, at: { insetInlineStart: -240, top: -320 } },
    { kind: "dome", width: 560, at: { insetInlineEnd: -170, top: -250 } },
    { kind: "pearl", width: 300, at: { insetInlineStart: -110, bottom: -130 } },
    { kind: "pebble", width: 170, height: 130, at: { insetInlineEnd: -50, bottom: -50 } },
  ],
  phone: [
    { kind: "glow", width: 460, at: { insetInlineStart: -210, top: -230 } },
    { kind: "dome", width: 330, at: { insetInlineEnd: -150, top: -110 } },
    { kind: "pearl", width: 230, at: { insetInlineEnd: -70, bottom: -50 } },
  ],
  login: [
    { kind: "glow", width: 980, at: { insetInlineEnd: 160, top: -220 } },
    { kind: "dome", width: 660, at: { insetInlineEnd: 390, top: -210 } },
    { kind: "pearl", width: 440, at: { insetInlineEnd: -130, bottom: -170 } },
    { kind: "glow", width: 420, height: 200, at: { insetInlineStart: 280, bottom: -90 } },
    { kind: "pearl", width: 210, at: { insetInlineStart: 380, bottom: -60 } },
    { kind: "pebble", width: 240, height: 160, at: { insetInlineEnd: 290, bottom: -50 } },
    { kind: "pebble", width: 170, height: 120, at: { insetInlineStart: 120, bottom: 30 } },
    { kind: "pebble", width: 90, height: 66, at: { insetInlineStart: 40, bottom: 180 } },
  ],
} satisfies Record<string, Piece[]>;

export type ScenePreset = keyof typeof PRESETS;

/** The sculpted background behind the glass: gold glow, glass dome, pearls and pebbles. */
export function Scene({ preset }: { preset: ScenePreset }) {
  const pieces: Piece[] = PRESETS[preset];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={cx("absolute block", KIND_CLASS[piece.kind])}
          style={{ width: piece.width, height: piece.height ?? piece.width, ...piece.at }}
        />
      ))}
    </div>
  );
}
