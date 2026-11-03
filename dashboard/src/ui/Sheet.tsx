import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useShell } from "../app/useShell";
import { useCopy } from "../content/locale";
import { cx } from "../lib/cx";
import { fadeOut, springs } from "../motion/springs";
import { IconButton } from "./IconButton";

export interface SheetProps {
  open: boolean;
  /** Called on Escape, the close button, a tap outside, or a drag down on phones. Set `open` to false here. */
  onClose: () => void;
  /** The visible heading, also the dialog's name. */
  title: string;
  /** Short text under the title, also the dialog's description. */
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons at the bottom, the main one first. */
  actions?: ReactNode;
  /** Focused when it opens. Otherwise the first control inside. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** "alertdialog" for confirmations. */
  role?: "dialog" | "alertdialog";
  /** Hide the close button, when Cancel is right there. */
  hideClose?: boolean;
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
// Phone sheets close when dragged down past 30% of their height, or flicked faster than 500px/s (spec section 8).
const DRAG_CLOSE_SHARE = 0.3;
const DRAG_CLOSE_SPEED = 500;

/**
 * A modal sheet on the native <dialog>: everything behind it is inert, Escape closes it, and focus comes back to
 * the control that opened it. Desktop: a white card in the middle. Phones: rises from the bottom and can be dragged closed.
 */
export function Sheet({ open, onClose, title, description, children, actions, initialFocus, role = "dialog", hideClose = false }: SheetProps) {
  const phone = useShell() === "phone";
  const { uiCopy } = useCopy();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dragControls = useDragControls();
  // The dialog stays open while the sheet animates out.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog || dialog.open) return;
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // jsdom has no showModal; the attribute keeps unit tests working.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    (initialFocus?.current ?? dialog.querySelector<HTMLElement>(FOCUSABLE))?.focus();
  }, [open, mounted, initialFocus]);

  const finishClosing = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    setMounted(false);
    const target = returnFocusTo.current;
    returnFocusTo.current = null;
    if (target?.isConnected) target.focus();
  };

  if (!mounted) return null;

  const panelMotion = phone
    ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%", transition: springs.surface } }
    : { initial: { opacity: 0, scale: 0.96, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, transition: fadeOut } };

  return (
    <dialog
      ref={dialogRef}
      role={role === "alertdialog" ? "alertdialog" : undefined}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Close through the parent, so the sheet can animate out first.
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      className={cx(
        "fixed inset-0 m-0 hidden size-full max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 text-copy backdrop:bg-transparent open:flex",
        phone ? "items-end justify-center p-3 pb-[max(12px,env(safe-area-inset-bottom))]" : "items-center justify-center p-6",
      )}
    >
      <AnimatePresence onExitComplete={finishClosing}>
        {open ? (
          <motion.div
            key="scrim"
            aria-hidden="true"
            onClick={onClose}
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: springs.surface }}
            exit={{ opacity: 0, transition: phone ? springs.surface : fadeOut }}
          />
        ) : null}
        {open ? (
          <motion.div
            key="panel"
            ref={panelRef}
            {...panelMotion}
            transition={springs.surface}
            drag={phone ? "y" : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={(_, info) => {
              const height = panelRef.current?.offsetHeight ?? 0;
              if (info.offset.y > height * DRAG_CLOSE_SHARE || info.velocity.y > DRAG_CLOSE_SPEED) onClose();
            }}
            className={cx(
              "surface-card relative flex max-h-full w-full flex-col overflow-x-hidden overflow-y-auto",
              phone ? "rounded-card-phone px-5 pt-2 pb-5" : "max-w-[460px] rounded-card p-7",
            )}
          >
            <div onPointerDown={phone ? (event) => dragControls.start(event) : undefined} className={cx(phone && "touch-none")}>
              {phone ? (
                <div className="flex justify-center pt-1 pb-3">
                  <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-ink/15" />
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                {/* A long email or name breaks onto the next line instead of widening the sheet. */}
                <h2 id={titleId} className="min-w-0 text-[26px] leading-tight font-light text-ink [overflow-wrap:anywhere] lg:text-display-3">
                  {title}
                </h2>
                {hideClose ? null : <IconButton icon="close" label={uiCopy.close} onClick={onClose} tone="paper" size={phone ? "md" : "sm"} />}
              </div>
            </div>
            {description ? (
              <div id={descriptionId} className="mt-3 text-body text-mute [overflow-wrap:anywhere]">
                {description}
              </div>
            ) : null}
            {children ? <div className="mt-5">{children}</div> : null}
            {actions ? <div className="mt-6 flex flex-wrap gap-2.5">{actions}</div> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </dialog>
  );
}
