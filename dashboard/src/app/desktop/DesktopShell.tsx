import { useRef } from "react";
import { useLocation } from "react-router";
import { AnimatedOutlet } from "../../motion/AnimatedOutlet";
import { desktopPageKey, railKeyFor, type RailKey } from "../sections";
import { useNavBadges } from "../useNavBadges";
import { LiquidPanel } from "./LiquidPanel";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";

/**
 * Desktop frame: the rail at the screen's start edge, and beside it the content panel, into which the rail swells
 * beside the current item. The rail and the panel stay put; only the content scrolls.
 */
export function DesktopShell() {
  const badges = useNavBadges();
  const { pathname } = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<RailKey, HTMLElement>());
  const active = railKeyFor(pathname);
  return (
    <div className="shell-frame relative h-dvh overflow-hidden">
      <div className="relative flex h-full">
        <Rail items={items} active={active} newLeads={badges.newLeads} />
        <div ref={panel} className="solid-ground relative z-10 my-3 me-3 flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col ps-10 pe-7 pt-5">
            <TopBar notifications={badges.notifications} />
            <main className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-9">
              <AnimatedOutlet pageKey={desktopPageKey} />
            </main>
          </div>
        </div>
        <LiquidPanel panel={panel} items={items} target={active} />
      </div>
    </div>
  );
}
