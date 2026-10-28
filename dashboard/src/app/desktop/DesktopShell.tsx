import { AnimatedOutlet } from "../../motion/AnimatedOutlet";
import { Scene } from "../../ui/Scene";
import { desktopPageKey } from "../sections";
import { useNavBadges } from "../useNavBadges";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";

/** Desktop frame: the glass rail and the top bar stay put; only the content scrolls. */
export function DesktopShell() {
  const badges = useNavBadges();
  return (
    <div className="relative h-dvh overflow-hidden">
      <Scene preset="app" />
      <div className="relative mx-auto flex h-full max-w-[1440px] gap-6 px-6 pt-5">
        <Rail passportsToday={badges.passportsToday} newLeads={badges.newLeads} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar notifications={badges.notifications} />
          <main className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-9">
            <AnimatedOutlet pageKey={desktopPageKey} />
          </main>
        </div>
      </div>
    </div>
  );
}
