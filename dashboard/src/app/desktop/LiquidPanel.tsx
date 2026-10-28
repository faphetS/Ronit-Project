import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useDirection } from "../../content/locale";
import { springs } from "../../motion/springs";

/** The panel's corner radius. */
const CORNER = 28;
/** The concave curve where the bump leaves the panel's edge. */
const FILLET = 14;
/** The bump's room above and below the item it holds. */
const PAD = 6;
/** How close the bump comes to the screen edge. */
const EDGE = 8;

interface Geometry {
  start: number;
  end: number;
  top: number;
  bottom: number;
  bump: { top: number; bottom: number } | null;
}

/** The panel and the current item, in px from the frame's start edge (x) and its top (y). */
function measure(frame: Element, panel: HTMLElement, item: HTMLElement | undefined, rtl: boolean): Geometry {
  const box = frame.getBoundingClientRect();
  const panelBox = panel.getBoundingClientRect();
  const fromStart = (x: number) => (rtl ? box.right - x : x - box.left);
  const itemBox = item?.getBoundingClientRect();
  return {
    start: fromStart(rtl ? panelBox.right : panelBox.left),
    end: fromStart(rtl ? panelBox.left : panelBox.right),
    top: panelBox.top - box.top,
    bottom: panelBox.bottom - box.top,
    bump: itemBox ? { top: itemBox.top - box.top - PAD, bottom: itemBox.bottom - box.top + PAD } : null,
  };
}

/** The panel's outline, with a bump on its start edge from `a` to `b` that reaches `reach` px toward the screen edge. */
function outline(start: number, end: number, top: number, bottom: number, a: number, b: number, rest: number, reach: number): string {
  const highest = top + CORNER + FILLET;
  const lowest = bottom - CORNER - FILLET;
  const bumpTop = Math.min(Math.max(a, highest), lowest - 2);
  const bumpBottom = Math.max(Math.min(b, lowest), bumpTop + 2);
  const length = bumpBottom - bumpTop;
  // Liquid keeps its volume: while the bump stretches, it reaches out a little less.
  const squeeze = rest > 0 ? Math.max(0.8, 1 - (length - rest) / (rest * 6)) : 1;
  const out = reach * squeeze;
  const body =
    `M ${start + CORNER} ${top} H ${end - CORNER} A ${CORNER} ${CORNER} 0 0 1 ${end} ${top + CORNER} ` +
    `V ${bottom - CORNER} A ${CORNER} ${CORNER} 0 0 1 ${end - CORNER} ${bottom} ` +
    `H ${start + CORNER} A ${CORNER} ${CORNER} 0 0 1 ${start} ${bottom - CORNER}`;
  const close = `V ${top + CORNER} A ${CORNER} ${CORNER} 0 0 1 ${start + CORNER} ${top} Z`;
  if (out < 0.5) return `${body} ${close}`;
  const fillet = Math.min(FILLET, out / 2);
  const tip = start - out;
  const round = Math.min(length / 2, out - fillet);
  const bump =
    `V ${bumpBottom + fillet} A ${fillet} ${fillet} 0 0 0 ${start - fillet} ${bumpBottom} ` +
    `H ${tip + round} A ${round} ${round} 0 0 1 ${tip} ${bumpBottom - round} ` +
    `V ${bumpTop + round} A ${round} ${round} 0 0 1 ${tip + round} ${bumpTop} ` +
    `H ${start - fillet} A ${fillet} ${fillet} 0 0 0 ${start} ${bumpTop - fillet}`;
  return `${body} ${bump} ${close}`;
}

interface LiquidPanelProps<K extends string> {
  /** The panel's content box: the shape is drawn around it. */
  panel: RefObject<HTMLElement | null>;
  /** The rail items by key. */
  items: RefObject<Map<K, HTMLElement>>;
  /** The rail item the panel reaches out to. */
  target: K | null;
}

/**
 * The desktop content panel, drawn as one shape whose start edge reaches out around the current rail item.
 * When the item changes, the bump's edge in front springs ahead and the edge behind follows, so the bump
 * flows along the panel's edge, stretching on the way and settling with a wobble.
 *
 * The svg covers the shell row, so its own box is the frame everything is measured in (a parent's ref is
 * not attached yet when a child's layout effect first runs). It draws from the start edge and is mirrored
 * by CSS in RTL. Render it after the rail and the panel, so they exist when it measures.
 */
export function LiquidPanel<K extends string>({ panel, items, target }: LiquidPanelProps<K>) {
  const frame = useRef<SVGSVGElement>(null);
  const rtl = useDirection() === "rtl";
  const reduceMotion = useReducedMotion();
  const start = useMotionValue(0);
  const end = useMotionValue(0);
  const top = useMotionValue(0);
  const bottom = useMotionValue(0);
  const bumpTop = useMotionValue(0);
  const bumpBottom = useMotionValue(0);
  const rest = useMotionValue(0);
  const reach = useMotionValue(0);
  const d = useTransform(() =>
    outline(start.get(), end.get(), top.get(), bottom.get(), bumpTop.get(), bumpBottom.get(), rest.get(), reach.get()),
  );
  const placed = useRef(false);
  const current = useRef(target);

  useLayoutEffect(() => {
    current.current = target;
    const frameElement = frame.current;
    const panelElement = panel.current;
    if (!frameElement || !panelElement) return;
    const geometry = measure(frameElement, panelElement, target === null ? undefined : items.current.get(target), rtl);
    start.jump(geometry.start);
    end.jump(geometry.end);
    top.jump(geometry.top);
    bottom.jump(geometry.bottom);
    const travel = placed.current && !reduceMotion;
    placed.current = true;
    const running: Array<{ stop: () => void }> = [];
    if (geometry.bump) {
      const { top: a, bottom: b } = geometry.bump;
      rest.jump(b - a);
      if (travel) {
        const down = a > bumpTop.get();
        running.push(animate(down ? bumpBottom : bumpTop, down ? b : a, springs.liquidLead));
        running.push(animate(down ? bumpTop : bumpBottom, down ? a : b, springs.liquidTrail));
      } else {
        bumpTop.jump(a);
        bumpBottom.jump(b);
      }
    }
    const toReach = geometry.bump ? Math.max(0, geometry.start - EDGE) : 0;
    if (travel) running.push(animate(reach, toReach, springs.surface));
    else reach.jump(toReach);
    return () => running.forEach((animation) => animation.stop());
  }, [panel, items, target, rtl, reduceMotion, start, end, top, bottom, bumpTop, bumpBottom, rest, reach]);

  // A resize moves the panel and the items: follow them without travel.
  useLayoutEffect(() => {
    const frameElement = frame.current;
    if (!frameElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const panelElement = panel.current;
      if (!panelElement) return;
      const key = current.current;
      const geometry = measure(frameElement, panelElement, key === null ? undefined : items.current.get(key), rtl);
      start.jump(geometry.start);
      end.jump(geometry.end);
      top.jump(geometry.top);
      bottom.jump(geometry.bottom);
      if (!geometry.bump) return;
      bumpTop.jump(geometry.bump.top);
      bumpBottom.jump(geometry.bump.bottom);
      rest.jump(geometry.bump.bottom - geometry.bump.top);
      reach.jump(Math.max(0, geometry.start - EDGE));
    });
    observer.observe(frameElement);
    return () => observer.disconnect();
  }, [panel, items, rtl, start, end, top, bottom, bumpTop, bumpBottom, rest, reach]);

  return (
    <svg ref={frame} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 size-full rtl:-scale-x-100">
      <motion.path d={d} className="liquid-panel" />
    </svg>
  );
}
