import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useCopy } from "../../content/locale";
import { fadeOut, springs } from "../../motion/springs";
import { IconButton } from "../../ui/IconButton";
import { MarkAllRead, NotificationList } from "./NotificationList";

/**
 * The bell in the desktop top bar, and the panel it opens under itself, in the account panel's warm glass. Escape, a
 * click outside, the focus moving elsewhere or a new page closes it; Escape brings the focus back to the bell.
 */
export function NotificationsMenu({ count }: { count: number }) {
  const { nav } = useCopy();
  const { pathname } = useLocation();
  // Open on the page it was opened on: going to another page closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = () => setOpenAt(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenAt(null);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpenAt(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="relative">
      <IconButton
        ref={button}
        icon="bell"
        label={nav.notifications(count)}
        badge={count}
        popup={{ kind: "dialog", expanded: open }}
        onClick={() => setOpenAt(open ? null : pathname)}
      />
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panel}
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            onBlur={(event) => {
              // Tabbing out closes it; a click on nothing in particular leaves it to the press outside.
              const next = event.relatedTarget;
              if (next && !panel.current?.contains(next) && !button.current?.contains(next)) setOpenAt(null);
            }}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: springs.ui }}
            exit={{ opacity: 0, scale: 0.98, transition: fadeOut }}
            className="account-panel absolute end-0 top-full z-40 mt-3 flex max-h-[min(70dvh,560px)] w-[380px] origin-top-right flex-col overflow-clip rounded-[28px] outline-none rtl:origin-top-left"
          >
            <div className="flex min-h-14 items-center justify-between gap-3 ps-5 pe-3 pt-2">
              <h2 id={titleId} className="text-[16px] font-semibold text-ink">
                {nav.bell.title}
              </h2>
              <MarkAllRead onMarked={() => panel.current?.focus({ preventScroll: true })} />
            </div>
            <div className="mx-2.5 mt-1 mb-2.5 min-h-0 overflow-y-auto rounded-[20px] bg-white/90 px-3.5 ring-1 ring-black/[0.04] [scrollbar-width:thin]">
              <NotificationList onNavigate={close} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
