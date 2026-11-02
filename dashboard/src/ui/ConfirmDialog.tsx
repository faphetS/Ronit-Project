import { useRef, type ReactNode } from "react";
import { useCopy } from "../content/locale";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

interface ConfirmDialogProps {
  open: boolean;
  /** The question: "לשלוח את ברכת חנוכה ל-412 לקוחות?". */
  title: string;
  /** What will happen, in a line or two. */
  description?: ReactNode;
  /** The action, as a verb phrase: "אישור ושליחה". */
  confirmLabel: string;
  onConfirm: () => void;
  /** Cancel, Escape, a tap outside, or a drag down on phones. Set `open` to false here. */
  onCancel: () => void;
  /** Defaults to the shared "ביטול" / "Cancel". */
  cancelLabel?: string;
  /** While the action runs: the confirm button is disabled. */
  pending?: boolean;
}

/**
 * Asks before an action that sends messages or closes Monday (spec sections 10 and 11).
 * Opens with focus on Cancel, the safe choice. The caller closes it in onConfirm (or after the action succeeds).
 */
export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel, cancelLabel, pending = false }: ConfirmDialogProps) {
  const { uiCopy } = useCopy();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      role="alertdialog"
      hideClose
      initialFocus={cancelRef}
      actions={
        <>
          <Button onClick={onConfirm} disabled={pending} className="flex-1 lg:flex-none">
            {confirmLabel}
          </Button>
          <Button ref={cancelRef} variant="outline" onClick={onCancel} className="flex-1 lg:flex-none">
            {cancelLabel ?? uiCopy.cancel}
          </Button>
        </>
      }
    />
  );
}
