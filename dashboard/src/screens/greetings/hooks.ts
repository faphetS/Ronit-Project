import { useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router";
import type { Locale } from "../../content/copy";
import { useScreenPath } from "../../motion/screen-path";

/**
 * Keeps a big headline at `maxSize` px unless a word would not fit its box, and then shrinks it just enough
 * ("חנוכה" fits the orb card at 60px; "Hanukkah" needs less). Children sized in em shrink with it.
 * Runs again when the box changes width, when the web font arrives, and when `text` changes.
 */
export function useFitText(ref: RefObject<HTMLElement | null>, maxSize: number, minSize: number, text: string): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      element.style.fontSize = `${maxSize}px`;
      const available = element.clientWidth;
      const needed = element.scrollWidth;
      if (available > 0 && needed > available) {
        element.style.fontSize = `${Math.max(minSize, Math.floor((maxSize * available) / needed))}px`;
      }
    };
    fit();
    let width = element.clientWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            // Only a new width matters; the height changes with the font size itself.
            if (element.clientWidth === width) return;
            width = element.clientWidth;
            fit();
          });
    observer?.observe(element);
    let live = true;
    if ("fonts" in document) {
      void document.fonts.ready.then(() => {
        if (live) fit();
      });
    }
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [ref, maxSize, minSize, text]);
}

/**
 * Scrolls to the section the address points at (#history from the rail, #send and #template from the orb cards)
 * once the screen's data has loaded, so the section is where it will stay, and moves focus there.
 * Arriving on the screen jumps; a link within the screen glides, unless Reduce Motion is on. Only the address's own
 * page does this: not a page the desktop reel shows on its way, nor one leaving.
 */
export function useScrollToHash(ready: boolean): void {
  const { hash, key, pathname } = useLocation();
  const screenPath = useScreenPath();
  const reduceMotion = useReducedMotion();
  // The navigation the screen first became ready on.
  const arrival = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || screenPath !== pathname) return;
    arrival.current ??= key;
    if (!hash) return;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    const glide = key !== arrival.current && !reduceMotion;
    const frame = window.requestAnimationFrame(() => {
      scrollToTop(target, glide ? "smooth" : "auto");
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, hash, key, pathname, screenPath, reduceMotion]);
}

/** Scrolls the nearest scrolling box (on desktop, the page's own) so `target` sits at its top. */
function scrollToTop(target: HTMLElement, behavior: ScrollBehavior): void {
  let box = target.parentElement;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  if (!box) {
    target.scrollIntoView({ behavior, block: "start" });
    return;
  }
  box.scrollTo({ top: target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop, behavior });
}

/**
 * Greeting texts are Hebrew content, also when the interface is in English, so in English their field follows the
 * text's own direction. TextArea takes no `dir`, so it is set on the textarea inside `container`.
 */
export function useTextDirection(container: RefObject<HTMLElement | null>, locale: Locale): void {
  useEffect(() => {
    const field = container.current?.querySelector("textarea");
    if (!field) return;
    if (locale === "en") field.setAttribute("dir", "auto");
    else field.removeAttribute("dir");
  }, [container, locale]);
}
