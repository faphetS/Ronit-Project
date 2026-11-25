import type { ReactNode } from "react";
import { useCopy } from "../content/locale";
import { cx } from "../lib/cx";
import { Button } from "./Button";
import { IconCircle, type IconCircleTone } from "./IconCircle";
import type { SurfaceVariant } from "./Surface";
import { MUTE_TEXT, STRONG_TEXT } from "./surface-tones";

const LOCK_TONE: Record<SurfaceVariant, IconCircleTone> = { card: "sand", glass: "glass", ink: "ink" };

/**
 * A card the person's role doesn't open: a lock, "locked for your role" and who can see it, in place of the content
 * (and of the error the API's refusal would show). The rest of the screen stays theirs.
 */
export function LockedState({ message, surface = "card", className }: { message: string; surface?: SurfaceVariant; className?: string }) {
  const { states } = useCopy();
  return (
    <div className={cx("flex flex-col items-center justify-center gap-3 py-6 text-center", className)}>
      <IconCircle icon="lock" tone={LOCK_TONE[surface]} size="md" />
      <div className="flex flex-col gap-1">
        <p className={cx("text-small font-medium", STRONG_TEXT[surface])}>{states.lockedTitle}</p>
        <p className={cx("max-w-[42ch] text-small", MUTE_TEXT[surface])}>{message}</p>
      </div>
    </div>
  );
}

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
    <div className="flex flex-col items-center gap-3 py-6 text-center">
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
