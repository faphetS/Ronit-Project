import { useState } from "react";
import { useCopy } from "../../content/locale";
import { IconButton } from "../../ui/IconButton";
import { Sheet } from "../../ui/Sheet";
import { MarkAllRead, NotificationList } from "./NotificationList";

/** The bell on a phone's top bar, and the sheet it opens with the notifications. Following a row closes the sheet. */
export function NotificationsSheet({ count }: { count: number }) {
  const { nav } = useCopy();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <IconButton icon="bell" label={nav.notifications(count)} badge={count} popup={{ kind: "dialog", expanded: open }} onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={close} title={nav.bell.title}>
        <div className="-mt-2 mb-1 flex justify-end empty:hidden">
          <MarkAllRead />
        </div>
        <NotificationList onNavigate={close} />
      </Sheet>
    </>
  );
}
