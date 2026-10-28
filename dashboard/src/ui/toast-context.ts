import { createContext, useContext } from "react";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  /** One short line: "הסטטוס עודכן: בשיחה". */
  message: string;
  /** Undo for a reversible change. Shows the shared "ביטול" / "Undo" button. */
  onUndo?: () => void;
  /** Any other single action. Wins over onUndo. */
  action?: ToastAction;
  /** "warning" when something did not go through. */
  tone?: "default" | "warning";
  /** Milliseconds on screen. 4000 by default; the timer waits while the pointer or focus is on the toast. */
  duration?: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export const TOAST_DURATION = 4000;

/** Without a ToastProvider (as in unit tests) toasts are silently skipped. */
export const ToastContext = createContext<ToastApi>({ show: () => "", dismiss: () => {} });

/** Short confirmations: top center on desktop, above the tab bar on phones, read politely by screen readers. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
