import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useDirection } from "../../content/locale";
import { springs } from "../../motion/springs";

/** The panel's corner radius. */
const CORNER = 28;
/** How far the rail's wave pushes into the panel beside the current item. */
const DEPTH = 22;
/** Half the wave's height: from where it leaves the straight edge to its crest, beside the item's center. */
const SWELL = 60;

interface Geometry {
  start: number;
  end: number;
  top: number;
  bottom: number;
  /** The current item's center, from the frame's top. */
  itemY: number | null;
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
    itemY: itemBox ? (itemBox.top + itemBox.bottom) / 2 - box.top : null,
  };
}

/**
 * The panel's outline, with the rail's wave pushed into its start edge. The crest runs from `a` to `b`: one point
 * at rest, a stretch while it travels. `presence` flattens the wave back into the edge.
 */
function outline(start: number, end: number, top: number, bottom: number, a: number, b: number, presence: number): string {
  const body =
    `M ${start + CORNER} ${top} H ${end - CORNER} A ${CORNER} ${CORNER} 0 0 1 ${end} ${top + CORNER} ` +
    `V ${bottom - CORNER} A ${CORNER} ${CORNER} 0 0 1 ${end - CORNER} ${bottom} ` +
    `H ${start + CORNER} A ${CORNER} ${CORNER} 0 0 1 ${start} ${bottom - CORNER}`;
  const close = `V ${top + CORNER} A ${CORNER} ${CORNER} 0 0 1 ${start + CORNER} ${top} Z`;
  if (presence < 0.01) return `${body} ${close}`;

  // Water keeps its volume: the longer the crest, the shallower the wave.
  const crest = start + DEPTH * presence * Math.max(0.6, 1 - Math.max(0, b - a) / (SWELL * 6));
  // The wave leaves the straight edge SWELL before the crest, never inside the corners.
  const leaveTop = Math.max(top + CORNER, a - SWELL);
  const leaveBottom = Math.min(bottom - CORNER, b + SWELL);
  const crestTop = Math.min(Math.max(a, leaveTop), leaveBottom);
  const crestBottom = Math.max(Math.min(b, leaveBottom), crestTop);
  const lowerMid = (leaveBottom + crestBottom) / 2;
  const upperMid = (crestTop + leaveTop) / 2;
  // Up the start edge: a smooth S into the wave, along its crest, and a smooth S back out to the edge.
  const wave =
    `V ${leaveBottom} C ${start} ${lowerMid} ${crest} ${lowerMid} ${crest} ${crestBottom} ` +
    `V ${crestTop} C ${crest} ${upperMid} ${start} ${upperMid} ${start} ${leaveTop}`;
  return `${body} ${wave} ${close}`;
}

interface LiquidPanelProps<K extends string> {
  /** The panel's content box: the shape is drawn around it. */
  panel: RefObject<HTMLElement | null>;
  /** The rail items by key. */
  items: RefObject<Map<K, HTMLElement>>;
  /** The rail item the wave stands beside. */
  target: K | null;
}

/**
 * The desktop content panel, drawn as one shape. Beside the current rail item the rail swells into the panel in a
 * soft wave. When the item changes, the wave's front springs ahead and its back follows, so it flows along the edge
 * as a long, shallow swell and gathers again at the new item.
 *
 * The svg covers the shell row, so its own box is the frame everything is measured in (a parent's ref is not
 * attached yet when a child's layout effect first runs). It draws from the start edge and is mirrored by CSS
 * in RTL. Render it after the rail and the panel, so they exist when it measures.
 */
export function LiquidPanel<K extends string>({ panel, items, target }: LiquidPanelProps<K>) {
  const frame = useRef<SVGSVGElement>(null);
  const rtl = useDirection() === "rtl";
  const reduceMotion = useReducedMotion();
  const start = useMotionValue(0);
  const end = useMotionValue(0);
  const top = useMotionValue(0);
  const bottom = useMotionValue(0);
  const crestTop = useMotionValue(0);
  const crestBottom = useMotionValue(0);
  const presence = useMotionValue(0);
  const d = useTransform(() =>
    outline(start.get(), end.get(), top.get(), bottom.get(), crestTop.get(), crestBottom.get(), presence.get()),
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
    if (geometry.itemY !== null) {
      const y = geometry.itemY;
      if (travel && presence.get() > 0.01) {
        // The front of the crest leads and its back follows: the wave stretches toward the new item.
        const down = y > crestTop.get();
        running.push(animate(down ? crestBottom : crestTop, y, springs.liquidLead));
        running.push(animate(down ? crestTop : crestBottom, y, springs.liquidTrail));
      } else {
        crestTop.jump(y);
        crestBottom.jump(y);
      }
    }
    const shown = geometry.itemY === null ? 0 : 1;
    if (travel) running.push(animate(presence, shown, springs.surface));
    else presence.jump(shown);
    return () => running.forEach((animation) => animation.stop());
  }, [panel, items, target, rtl, reduceMotion, start, end, top, bottom, crestTop, crestBottom, presence]);

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
      if (geometry.itemY === null) return;
      crestTop.jump(geometry.itemY);
      crestBottom.jump(geometry.itemY);
    });
    observer.observe(frameElement);
    return () => observer.disconnect();
  }, [panel, items, rtl, start, end, top, bottom, crestTop, crestBottom]);

  return (
    <svg ref={frame} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 size-full will-change-transform rtl:-scale-x-100">
      <motion.path d={d} className="liquid-panel" />
    </svg>
  );
}
