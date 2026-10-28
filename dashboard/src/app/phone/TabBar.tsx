import { LayoutGroup, motion } from "motion/react";
import { useLocation } from "react-router";
import { useCopy } from "../../content/locale";
import { cx } from "../../lib/cx";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Icon } from "../../ui/Icon";
import { MotionLink } from "../../ui/MotionLink";
import { PHONE_TABS, phoneTabFor } from "../sections";

/** Floating glass tab bar. The dark highlight glides to the current tab. */
export function TabBar() {
  const { nav } = useCopy();
  const { pathname } = useLocation();
  const current = phoneTabFor(pathname);
  return (
    <LayoutGroup id="tab-bar">
      <nav aria-label={nav.main} className="surface-glass absolute inset-x-3.5 bottom-4 z-20 flex gap-0.5 rounded-[32px] p-1.5" style={{ boxShadow: "var(--shadow-float)" }}>
        {PHONE_TABS.map((tab) => {
          const active = tab.key === current;
          return (
            <MotionLink
              key={tab.key}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              whileTap={{ scale: PRESS_SCALE }}
              transition={springs.ui}
              className="relative flex h-14 flex-1 flex-col items-center justify-center rounded-[26px] text-[11.5px] font-medium"
            >
              {active ? <motion.span layoutId="tab-highlight" transition={springs.ui} className="absolute inset-0 rounded-[26px] bg-ink" /> : null}
              <span className={cx("relative flex flex-col items-center gap-0.5", active ? "text-cream" : "text-copy")}>
                <Icon name={tab.icon} />
                {nav.tabs[tab.key]}
              </span>
            </MotionLink>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
