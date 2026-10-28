import { useCopy } from "../../content/locale";
import { Field } from "../../ui/Field";
import { IconButton } from "../../ui/IconButton";
import { LanguageSwitch } from "../../ui/LanguageSwitch";
import { PillNav } from "./PillNav";

/** Fixed top bar: the menu, search, the language switch and notifications. */
export function TopBar({ newLeads, notifications }: { newLeads: number; notifications: number }) {
  const { nav } = useCopy();
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
      <PillNav newLeads={newLeads} />
      <div className="flex items-center gap-3">
        <Field label={nav.search} icon="search" name="q" type="search" size="sm" className="w-[270px]" />
        <LanguageSwitch />
        <IconButton icon="bell" label={nav.notifications(notifications)} badge={notifications} />
      </div>
    </header>
  );
}
