import { useCopy } from "../../content/locale";
import { Field } from "../../ui/Field";
import { IconButton } from "../../ui/IconButton";
import { LanguageSwitch } from "../../ui/LanguageSwitch";

/** Fixed top bar: search, the language switch and notifications. The sections are on the rail. */
export function TopBar({ notifications }: { notifications: number }) {
  const { nav } = useCopy();
  return (
    <header className="flex items-center justify-between gap-3 pb-4">
      <Field label={nav.search} icon="search" name="q" type="search" size="sm" className="w-[320px]" />
      <div className="flex items-center gap-3">
        <LanguageSwitch />
        <IconButton icon="bell" label={nav.notifications(notifications)} badge={notifications} />
      </div>
    </header>
  );
}
