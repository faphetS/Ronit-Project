import type { ReactNode } from "react";
import { useCopy } from "../content/locale";
import { cx } from "../lib/cx";
import { Button } from "./Button";

/** Soft placeholder block, shaped like the content that is loading. No pulse under Reduce Motion. */
export function Skeleton({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return <span aria-hidden="true" className={cx("block animate-pulse rounded-inner motion-reduce:animate-none", onDark ? "bg-white/10" : "bg-ink/6", className)} />;
}

/** Loading region: tells screen readers it is loading, and shows skeleton lines. */
export function LoadingBlock({ lines = 3, onDark = false, className }: { lines?: number; onDark?: boolean; className?: string }) {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className={cx("flex flex-col gap-3", className)}>
      <span className="sr-only">{states.loading}</span>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} onDark={onDark} className={index === 0 ? "h-8 w-1/2" : "h-5 w-full"} />
      ))}
    </div>
  );
}

/** Nothing to show: one line and the next step. */
export function EmptyState({ message, action, onDark = false }: { message: string; action?: ReactNode; onDark?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className={cx("text-small", onDark ? "text-ink-mute" : "text-mute")}>{message}</p>
      {action}
    </div>
  );
}

/** Something failed: say so inside the card and offer a retry. Never a blocking alert. */
export function ErrorState({ message, onRetry, onDark = false }: { message?: string; onRetry: () => void; onDark?: boolean }) {
  const { states } = useCopy();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
      <p className={cx("text-small", onDark ? "text-ink-mute" : "text-mute")}>{message ?? states.error}</p>
      <Button variant="outline" size="sm" onDark={onDark} onClick={onRetry}>
        {states.retry}
      </Button>
    </div>
  );
}
