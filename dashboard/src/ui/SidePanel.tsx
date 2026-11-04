import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { useCopy, useDirection } from "../content/locale";
import { cx } from "../lib/cx";
import { fadeOut, springs } from "../motion/springs";
import { IconButton } from "./IconButton";

interface SidePanelProps {
  /** The panel's name: "פרטי ליד: יעל פרץ". */
  label: string;
  /** The top row, beside the close button: avatar, name, status. */
  header?: ReactNode;
  /** Shows a close button, and Escape inside the panel closes it. */
  onClose?: () => void;
  /** Move focus into the panel when it opens, for keyboard users who opened it from a list. */
  focusOnOpen?: boolean;
  /** "card" where it floats over other content, which would show through glass. */
  surface?: "glass" | "card";
  children: ReactNode;
  className?: string;
}

const SLIDE = 24;

/**
 * The desktop detail panel beside a list (the lead beside the leads table). A glass column that slides in from
 * the inline-end side, the left in Hebrew and the right in English. Wrap it in AnimatePresence so it can slide out.
 */
export function SidePanel({ label, header, onClose, focusOnOpen = false, surface = "glass", children, className }: SidePanelProps) {
  const { uiCopy } = useCopy();
  const from = (useDirection() === "rtl" ? -1 : 1) * SLIDE;
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusOnOpen) panelRef.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);

  return (
    <motion.aside
      ref={panelRef}
      tabIndex={-1}
      aria-label={label}
      initial={{ opacity: 0, x: from }}
      animate={{ opacity: 1, x: 0, transition: springs.surface }}
      exit={{ opacity: 0, x: from, transition: fadeOut }}
      onKeyDown={
        onClose
          ? (event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              onClose();
            }
          : undefined
      }
      className={cx(surface === "card" ? "surface-card" : "surface-glass", "flex flex-col gap-[18px] rounded-card px-[22px] py-5", className)}
    >
      {header || onClose ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{header}</div>
          {onClose ? <IconButton icon="close" label={uiCopy.close} onClick={onClose} tone="paper" size="sm" /> : null}
        </div>
      ) : null}
      {children}
    </motion.aside>
  );
}
