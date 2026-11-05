import { animate, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { formatNumber } from "../lib/format";
import { useEntrance } from "../motion/entrance";
import { springs } from "../motion/springs";

/**
 * A number as text. On the visit's first page a hero number (`fromZero`) counts up from zero once, the first time its
 * element comes into view (spec section 8). After that, and on later pages, a new value ticks over from the old one.
 * Without IntersectionObserver (as in tests) or with Reduce Motion it never moves.
 */
export function useCountUp(value: number, ref: RefObject<Element | null>, fromZero = true): MotionValue<string> {
  const reduceMotion = useReducedMotion();
  const entrance = useEntrance();
  const [startsAtZero] = useState(() => fromZero && entrance && !reduceMotion && typeof IntersectionObserver !== "undefined");
  const counted = useRef(!startsAtZero);
  const current = useMotionValue(startsAtZero ? 0 : value);

  useEffect(() => {
    if (counted.current) {
      // A new value while it's on screen ticks over from the old one; it never counts from zero again.
      if (reduceMotion || current.get() === value) {
        current.set(value);
        return;
      }
      const ticking = animate(current, value, springs.gentle);
      return () => ticking.stop();
    }
    const element = ref.current;
    if (!element) return;
    let running: { stop: () => void } | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      counted.current = true;
      running = animate(current, value, springs.gentle);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      running?.stop();
    };
  }, [value, current, ref, reduceMotion]);

  return useTransform(current, (latest) => formatNumber(Math.round(latest)));
}
