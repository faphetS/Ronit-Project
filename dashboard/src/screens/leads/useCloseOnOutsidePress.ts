import { useEffect, type RefObject } from "react";

/**
 * Presses that never close the panel:
 * - a lead's card: opening it, its contact buttons, or starting a drag on the board;
 * - menus, pop-ups, dialogs and toasts, which float above the page, and the buttons that open a panel over it (the
 *   bell, the account): closing the lead would change the page, and a new page closes the panel they open.
 */
const KEEPS_OPEN =
  'a[href^="/leads/"], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [popover], [aria-haspopup="dialog"], [data-toast], [data-lead-card]';

/** While `active`, a main-button press anywhere outside `ref` calls `onClose`. */
export function useCloseOnOutsidePress(ref: RefObject<HTMLElement | null>, onClose: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const press = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (ref.current?.contains(event.target) || event.target.closest(KEEPS_OPEN)) return;
      onClose();
    };
    document.addEventListener("pointerdown", press);
    return () => document.removeEventListener("pointerdown", press);
  }, [ref, onClose, active]);
}
