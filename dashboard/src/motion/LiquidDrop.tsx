import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useDirection } from "../content/locale";
import { cx } from "../lib/cx";
import { springs } from "./springs";

type Axis = "x" | "y";

interface LiquidDropProps<K extends string> {
  /** "y" for a column of items (the rail), "x" for a row (the tab bar). */
  axis: Axis;
  /**
   * The items by key. The drop must share their offsetParent: render it inside the same positioned container,
   * after the items, so they are registered when it first measures (lift the items above it with a z-index).
   */
  items: RefObject<Map<K, HTMLElement>>;
  /** The item the drop sits on. */
  target: K | null;
  visible?: boolean;
  className?: string;
}

/** Where an item sits along the axis and across it, in px from its offsetParent. Physical, so it holds in both directions. */
function measure(element: HTMLElement, axis: Axis) {
  return axis === "y"
    ? { start: element.offsetTop, end: element.offsetTop + element.offsetHeight, cross: element.offsetLeft, thickness: element.offsetWidth }
    : { start: element.offsetLeft, end: element.offsetLeft + element.offsetWidth, cross: element.offsetTop, thickness: element.offsetHeight };
}

/**
 * A liquid drop that marks an item. When the target changes, the edge in front springs ahead and the edge behind
 * follows, so the drop stretches toward the new item, thins a little, and settles with a wobble. It lands without
 * travel the first time, when it reappears, when the language turns the layout around, when the container
 * resizes, and under Reduce Motion.
 */
export function LiquidDrop<K extends string>({ axis, items, target, visible = true, className }: LiquidDropProps<K>) {
  const drop = useRef<HTMLSpanElement>(null);
  const direction = useDirection();
  const reduceMotion = useReducedMotion();
  const start = useMotionValue(0);
  const end = useMotionValue(0);
  const cross = useMotionValue(0);
  const thickness = useMotionValue(0);
  const length = useTransform(() => end.get() - start.get());
  // Liquid keeps its volume: the longer the drop, the thinner it gets.
  const squeeze = useTransform(() => {
    const across = thickness.get();
    return across > 0 ? Math.max(0.78, 1 - (end.get() - start.get() - across) / (across * 8)) : 1;
  });
  const placed = useRef(false);
  const shown = useRef(visible);
  const current = useRef(target);
  const turned = useRef(direction);

  useLayoutEffect(() => {
    current.current = target;
    const sameDirection = turned.current === direction;
    turned.current = direction;
    const travel = placed.current && shown.current && sameDirection && !reduceMotion;
    shown.current = visible;
    const element = target === null ? undefined : items.current.get(target);
    if (!element) return;
    const box = measure(element, axis);
    cross.jump(box.cross);
    thickness.jump(box.thickness);
    if (!travel) {
      start.jump(box.start);
      end.jump(box.end);
      placed.current = true;
      return;
    }
    const forward = box.start > start.get();
    const leading = animate(forward ? end : start, forward ? box.end : box.start, springs.liquidLead);
    const trailing = animate(forward ? start : end, forward ? box.start : box.end, springs.liquidTrail);
    return () => {
      leading.stop();
      trailing.stop();
    };
  }, [axis, items, target, visible, direction, reduceMotion, start, end, cross, thickness]);

  // A resize moves the items: follow them without travel.
  useLayoutEffect(() => {
    const container = drop.current?.parentElement;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const element = current.current === null ? undefined : items.current.get(current.current);
      if (!element) return;
      const box = measure(element, axis);
      start.jump(box.start);
      end.jump(box.end);
      cross.jump(box.cross);
      thickness.jump(box.thickness);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [axis, items, start, end, cross, thickness]);

  const geometry =
    axis === "y"
      ? { x: cross, y: start, width: thickness, height: length, scaleX: squeeze }
      : { x: start, y: cross, width: length, height: thickness, scaleY: squeeze };
  const on = visible && target !== null;

  return (
    <motion.span
      ref={drop}
      aria-hidden="true"
      // Measured positions are physical (offsetLeft), so the drop is placed from the physical top-left corner.
      className={cx("pointer-events-none absolute top-0 left-0", className)}
      style={geometry}
      initial={false}
      animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.6 }}
      transition={springs.ui}
    />
  );
}
