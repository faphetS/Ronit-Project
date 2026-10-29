import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useDirection } from "../../content/locale";
import { springs } from "../../motion/springs";

/** The panel's corner radius. */
const CORNER = 28;
/** The bulb that holds the current item: a circle around the item's center. */
const BULB = 28;
/** The concave curves that join the bulb to the panel's edge. */
const FILLET = 24;

interface Geometry {
  start: number;
  end: number;
  top: number;
  bottom: number;
  /** The current item's center. */
  item: { x: number; y: number } | null;
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
    item: itemBox ? { x: fromStart((itemBox.left + itemBox.right) / 2), y: (itemBox.top + itemBox.bottom) / 2 - box.top } : null,
  };
}

/**
 * The panel's outline. On its start edge, a bulb centered at `x` spans `a` to `b` (a circle at rest, a capsule
 * while it travels) and flows into the edge through two fillets. `presence` melts the bulb into the edge.
 */
function outline(start: number, end: number, top: number, bottom: number, x: number, a: number, b: number, presence: number): string {
  const body =
    `M ${start + CORNER} ${top} H ${end - CORNER} A ${CORNER} ${CORNER} 0 0 1 ${end} ${top + CORNER} ` +
    `V ${bottom - CORNER} A ${CORNER} ${CORNER} 0 0 1 ${end - CORNER} ${bottom} ` +
    `H ${start + CORNER} A ${CORNER} ${CORNER} 0 0 1 ${start} ${bottom - CORNER}`;
  const close = `V ${top + CORNER} A ${CORNER} ${CORNER} 0 0 1 ${start + CORNER} ${top} Z`;
  if (presence < 0.01) return `${body} ${close}`;

  const length = Math.max(b - a, 0);
  // Liquid keeps its volume: the longer the bulb, the thinner it gets.
  const squeeze = Math.max(0.8, 1 - Math.max(0, length - 2 * BULB) / (BULB * 12));
  const radius = Math.min(BULB * squeeze, length / 2) * presence;
  const center = start - (start - x) * presence;
  const fillet = FILLET * presence;
  // The fillets touch the edge and the bulb: their centers sit `fillet` off the edge, `radius + fillet` from the bulb's.
  const across = start - fillet - center;
  const rise = Math.sqrt(Math.max((radius + fillet) ** 2 - across ** 2, 0));
  const upper = Math.max(a + radius, top + CORNER + rise);
  const lower = Math.max(Math.min(b - radius, bottom - CORNER - rise), upper);
  const touch = radius / (radius + fillet);
  const tangentX = center + across * touch;
  const bulb =
    `V ${lower + rise} A ${fillet} ${fillet} 0 0 0 ${tangentX} ${lower + rise * touch} ` +
    `A ${radius} ${radius} 0 0 1 ${center - radius} ${lower} V ${upper} ` +
    `A ${radius} ${radius} 0 0 1 ${tangentX} ${upper - rise * touch} A ${fillet} ${fillet} 0 0 0 ${start} ${upper - rise}`;
  return `${body} ${bulb} ${close}`;
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
 * The desktop content panel, drawn as one shape: on its start edge a bulb of the panel holds the current rail
 * item, like a drop clinging to the edge. When the item changes, the bulb's edge in front springs ahead and the
 * edge behind follows, so it flows along the panel's edge as a capsule and rounds up again at the new item.
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
  const bulbX = useMotionValue(0);
  const bulbTop = useMotionValue(0);
  const bulbBottom = useMotionValue(0);
  const presence = useMotionValue(0);
  const d = useTransform(() =>
    outline(start.get(), end.get(), top.get(), bottom.get(), bulbX.get(), bulbTop.get(), bulbBottom.get(), presence.get()),
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
    if (geometry.item) {
      const a = geometry.item.y - BULB;
      const b = geometry.item.y + BULB;
      bulbX.jump(geometry.item.x);
      if (travel) {
        // The edge in front leads and the edge behind follows: the bulb stretches toward the new item.
        const down = a > bulbTop.get();
        running.push(animate(down ? bulbBottom : bulbTop, down ? b : a, springs.liquidLead));
        running.push(animate(down ? bulbTop : bulbBottom, down ? a : b, springs.liquidTrail));
      } else {
        bulbTop.jump(a);
        bulbBottom.jump(b);
      }
    }
    const shown = geometry.item ? 1 : 0;
    if (travel) running.push(animate(presence, shown, springs.surface));
    else presence.jump(shown);
    return () => running.forEach((animation) => animation.stop());
  }, [panel, items, target, rtl, reduceMotion, start, end, top, bottom, bulbX, bulbTop, bulbBottom, presence]);

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
      if (!geometry.item) return;
      bulbX.jump(geometry.item.x);
      bulbTop.jump(geometry.item.y - BULB);
      bulbBottom.jump(geometry.item.y + BULB);
    });
    observer.observe(frameElement);
    return () => observer.disconnect();
  }, [panel, items, rtl, start, end, top, bottom, bulbX, bulbTop, bulbBottom]);

  return (
    <svg ref={frame} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 size-full will-change-transform rtl:-scale-x-100">
      <motion.path d={d} className="liquid-panel" />
    </svg>
  );
}
