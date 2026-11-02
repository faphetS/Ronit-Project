import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Motion defaults for the whole app. With Reduce Motion on, movement turns into fades. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
