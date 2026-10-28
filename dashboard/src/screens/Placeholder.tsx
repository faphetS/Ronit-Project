import { PhoneTopBar } from "../app/phone/PhoneTopBar";
import { isPushedRoute } from "../app/sections";
import { useShell } from "../app/useShell";
import { useCopy } from "../content/locale";
import type { ScreenKey } from "../content/screens.he";
import { useScreenPath } from "../motion/screen-path";
import { Headline } from "../ui/Headline";
import { ScreenFrame } from "../ui/ScreenFrame";
import { EmptyState } from "../ui/states";
import { Surface } from "../ui/Surface";

/** Stands in for a screen that is built in a later phase. On phones /users is the account screen. */
export function Placeholder({ screen }: { screen: ScreenKey }) {
  const phone = useShell() === "phone";
  const pathname = useScreenPath();
  const { comingSoon, screens } = useCopy();
  const copy = screens[phone && screen === "users" ? "account" : screen];
  return (
    <ScreenFrame>
      {phone ? <PhoneTopBar title={isPushedRoute(pathname) ? copy.title : undefined} /> : null}
      <Headline title={copy.title} soft={copy.soft} size={phone ? "display-2" : "display"} />
      <Surface variant="glass" compact={phone} aria-label={copy.title}>
        <EmptyState message={comingSoon} />
      </Surface>
    </ScreenFrame>
  );
}
