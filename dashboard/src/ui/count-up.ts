import { animate, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { formatNumber } from "../lib/format";
import { useEntrance } from "../motion/entrance";
import { springs } from "../motion/springs";

/**
 * A number as text that counts up from zero once, the first time its element comes into view (spec section 8), on the
 * visit's first page. Later changes, and later pages, show it at once. Without IntersectionObserver (as in tests) or
 * with Reduce Motion it never counts.
 */
export function useCountUp(value: number, ref: RefObject<Element | null>): MotionValue<string> {
  const reduceMotion = useReducedMotion();
  const entrance = useEntrance();
  const [startsAtZero] = useState(() => entrance && !reduceMotion && typeof IntersectionObserver !== "undefined");
  const counted = useRef(!startsAtZero);
  const current = useMotionValue(startsAtZero ? 0 : value);

  useEffect(() => {
    if (counted.current) {
      current.set(value);
      return;
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
  }, [value, current, ref]);

  return useTransform(current, (latest) => formatNumber(Math.round(latest)));
}
