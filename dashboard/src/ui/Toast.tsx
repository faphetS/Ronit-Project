import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useShell } from "../app/useShell";
import { useCopy } from "../content/locale";
import { cx } from "../lib/cx";
import { fadeOut, springs } from "../motion/springs";
import { Icon } from "./Icon";
import { TOAST_DURATION, ToastContext, type ToastApi, type ToastOptions } from "./toast-context";

interface ToastEntry extends ToastOptions {
  id: string;
}

const MAX_TOASTS = 3;
// About 1.5 seconds of frames: longer than any sheet takes to close.
const MAX_WAIT_FRAMES = 90;

function modalDialogOpen(): boolean {
  try {
    return document.querySelector("dialog:modal") !== null;
  } catch {
    // :modal is unknown here (as in jsdom).
    return false;
  }
}

/**
 * While a modal dialog is open (or still animating closed) the rest of the page is inert, and screen readers
 * skip changes there. A toast shown from a confirmation therefore waits until the dialog has closed.
 */
function whenNoModalDialog(run: () => void) {
  let frames = 0;
  const check = () => {
    frames += 1;
    if (!modalDialogOpen() || frames > MAX_WAIT_FRAMES) run();
    else window.requestAnimationFrame(check);
  };
  check();
}

function ToastBody({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: string) => void }) {
  const { uiCopy } = useCopy();
  const [paused, setPaused] = useState(false);
  const duration = toast.duration ?? TOAST_DURATION;

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [paused, duration, toast.id, onDismiss]);

  const action = toast.action ?? (toast.onUndo ? { label: uiCopy.undo, onAction: toast.onUndo } : undefined);
  const resumeUnlessInside = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
  };
  const button = "shrink-0 rounded-full transition-colors hover:bg-white/10 focus-visible:outline-cream";

  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={resumeUnlessInside}
      className="flex items-center gap-3 rounded-[24px] bg-ink py-2 ps-2 pe-2 text-cream shadow-float"
    >
      <span aria-hidden="true" className={cx("grid size-8 shrink-0 place-items-center rounded-full", toast.tone === "warning" ? "bg-status-warning text-cream" : "bg-gold text-ink")}>
        <Icon name={toast.tone === "warning" ? "alert" : "check"} size={16} />
      </span>
      <p className="min-w-0 flex-1 py-1 text-[14.5px] leading-snug">{toast.message}</p>
      {action ? (
        <button
          type="button"
          onClick={() => {
            action.onAction();
            onDismiss(toast.id);
          }}
          className={cx(button, "h-11 px-3.5 text-[14px] font-medium text-gold lg:h-9")}
        >
          {action.label}
        </button>
      ) : null}
      <button type="button" aria-label={uiCopy.close} onClick={() => onDismiss(toast.id)} className={cx(button, "grid size-11 place-items-center text-ink-mute hover:text-cream lg:size-9")}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastEntry[]; onDismiss: (id: string) => void }) {
  const phone = useShell() === "phone";
  // Desktop: drops in at the top. Phones: rises above the floating tab bar.
  const offset = phone ? 16 : -16;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className={cx("pointer-events-none fixed inset-x-0 z-50 flex items-center gap-2 px-4", phone ? "bottom-[96px] flex-col-reverse" : "top-5 flex-col")}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout="position"
            initial={{ opacity: 0, y: offset, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: fadeOut }}
            transition={springs.surface}
            className="pointer-events-auto w-full max-w-[520px] lg:w-auto lg:min-w-[320px]"
          >
            <ToastBody toast={toast} onDismiss={onDismiss} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Holds the toasts and shows them. Mounted once, in AppProviders. Screens call useToast() from ./toast-context. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);
  const api = useMemo<ToastApi>(
    () => ({
      show: (options) => {
        nextId.current += 1;
        const id = `toast-${nextId.current}`;
        whenNoModalDialog(() => setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { ...options, id }]));
        return id;
      },
      dismiss: (id) => setToasts((list) => list.filter((toast) => toast.id !== id)),
    }),
    [],
  );
  return (
    <ToastContext value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={api.dismiss} />
    </ToastContext>
  );
}
