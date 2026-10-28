import { useRef } from "react";
import { useLocation } from "react-router";
import { useCopy } from "../../content/locale";
import { cx } from "../../lib/cx";
import { LiquidDrop } from "../../motion/LiquidDrop";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Icon } from "../../ui/Icon";
import { MotionLink } from "../../ui/MotionLink";
import { PHONE_TABS, phoneTabFor, type PhoneTabKey } from "../sections";

/** Floating glass tab bar. An ink drop flows to the current tab. */
export function TabBar() {
  const { nav } = useCopy();
  const { pathname } = useLocation();
  const current = phoneTabFor(pathname);
  const items = useRef(new Map<PhoneTabKey, HTMLElement>());
  return (
    <nav aria-label={nav.main} className="surface-glass absolute inset-x-3.5 bottom-4 z-20 flex gap-0.5 rounded-[32px] p-1.5" style={{ boxShadow: "var(--shadow-float)" }}>
      <LiquidDrop axis="x" items={items} target={current} className="liquid-drop rounded-[26px]" />
      {PHONE_TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <MotionLink
            key={tab.key}
            ref={(element: HTMLElement | null) => {
              if (element) items.current.set(tab.key, element);
              else items.current.delete(tab.key);
            }}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            whileTap={{ scale: PRESS_SCALE }}
            transition={springs.ui}
            className="relative flex h-14 flex-1 flex-col items-center justify-center rounded-[26px] text-[11.5px] font-medium"
          >
            <span className={cx("relative flex flex-col items-center gap-0.5 transition-colors duration-300", active ? "text-cream" : "text-copy")}>
              <Icon name={tab.icon} />
              {nav.tabs[tab.key]}
            </span>
          </MotionLink>
        );
      })}
    </nav>
  );
}
