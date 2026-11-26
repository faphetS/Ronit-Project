import { NotificationsMenu } from "../notifications/NotificationsMenu";
import { QuickSearch } from "./QuickSearch";

/** Fixed top bar: search and the bell, which opens the notifications. The sections are on the rail; the language is in the settings. */
export function TopBar({ notifications }: { notifications: number }) {
  return (
    <header className="flex items-center justify-between gap-3 pb-4">
      <QuickSearch />
      <NotificationsMenu count={notifications} />
    </header>
  );
}
