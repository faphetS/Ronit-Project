import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, vi } from "vitest";
import { setViewportWidth } from "./viewport";

// The clock stands at 2026-10-28 15:30 Israel time, so dates on screen are the same in every run.
// Only Date is faked: timers stay real for React Query and user events.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-28T13:30:00Z"));

// Springs finish instantly in tests, so assertions never wait on animation.
MotionGlobalConfig.skipAnimations = true;

// findBy and waitFor wait up to 5 seconds: jsdom is slow on Windows when many test files run in parallel.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no matchMedia. Width queries are evaluated against window.innerWidth,
// so a test can pick the phone shell with setViewportWidth(390) before rendering.
function evaluate(query: string): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  if (min) return window.innerWidth >= Number(min[1]);
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  if (max) return window.innerWidth <= Number(max[1]);
  return false;
}

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: evaluate(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

setViewportWidth(1440);

afterEach(() => {
  cleanup();
  setViewportWidth(1440);
  window.sessionStorage.clear();
});
