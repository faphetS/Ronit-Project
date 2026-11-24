import { useEffect, type RefObject } from "react";

/**
 * Presses that never close the panel:
 * - another lead's card, which opens that lead instead (and starts a drag on the board);
 * - menus, pop-ups, dialogs and toasts, which float above the page.
 */
const KEEPS_OPEN = 'a[href^="/leads/"], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [popover], [data-toast]';

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
