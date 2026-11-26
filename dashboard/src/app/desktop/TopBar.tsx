import { LanguageSwitch } from "../../ui/LanguageSwitch";
import { NotificationsMenu } from "../notifications/NotificationsMenu";
import { QuickSearch } from "./QuickSearch";

/** Fixed top bar: search, the language switch and the bell, which opens the notifications. The sections are on the rail. */
export function TopBar({ notifications }: { notifications: number }) {
  return (
    <header className="flex items-center justify-between gap-3 pb-4">
      <QuickSearch />
      <div className="flex items-center gap-3">
        <LanguageSwitch />
        <NotificationsMenu count={notifications} />
      </div>
    </header>
  );
}
