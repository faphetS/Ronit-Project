import { useRef } from "react";
import { useLocation } from "react-router";
import { SectionReel, type ReelSection } from "../../motion/SectionReel";
import { desktopPageKey, railIndexFor, railKeyFor, type RailKey } from "../sections";
import { useNavBadges } from "../useNavBadges";
import { LiquidPanel } from "./LiquidPanel";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";

/**
 * Desktop frame: the rail at the screen's start edge, and beside it the content panel, into which the rail swells
 * beside the current item. The rail and the panel stay put; only the content scrolls. Sections sit on a reel in
 * the rail's order: opening one spins the content past the sections in between (`sections`, their main pages).
 */
export function DesktopShell({ sections }: { sections?: readonly ReelSection[] }) {
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
            {/* Each page scrolls on its own, so the reel can spin them past each other. The panel clips them and
                can't be scrolled itself, even by a jump to a section mid-spin. */}
            <main className="relative -mx-3 min-h-0 flex-1 overflow-clip">
              <SectionReel
                pageKey={desktopPageKey}
                sectionOf={railIndexFor}
                sections={sections}
                className="no-scrollbar absolute inset-0 overflow-y-auto px-3 pt-2 pb-9"
              />
            </main>
          </div>
        </div>
        <LiquidPanel panel={panel} items={items} target={active} />
      </div>
    </div>
  );
}
