import { LayoutGroup, motion } from "motion/react";
import { NavLink } from "react-router";
import { useCopy } from "../../content/locale";
import { cx } from "../../lib/cx";
import { springs } from "../../motion/springs";
import { DESKTOP_NAV } from "../sections";

/** Glass pill menu. The dark pill glides to the current section. */
export function PillNav({ newLeads }: { newLeads: number }) {
  const { nav } = useCopy();
  return (
    <LayoutGroup id="desktop-nav">
      <nav aria-label={nav.main} className="surface-glass flex flex-wrap items-center gap-0.5 rounded-full p-1.5">
        {DESKTOP_NAV.map((item) => (
          <NavLink key={item.key} to={item.to} end={item.end} className="relative inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-[14.5px] font-medium whitespace-nowrap">
            {({ isActive }) => (
              <>
                {isActive ? <motion.span layoutId="pill" transition={springs.ui} className="absolute inset-0 rounded-full bg-ink" /> : null}
                <span className={cx("relative", isActive ? "text-cream" : "text-copy")}>{nav.items[item.key]}</span>
                {item.key === "leads" && newLeads > 0 ? (
                  <>
                    {" "}
                    <span className={cx("relative grid h-[22px] min-w-6 place-items-center rounded-full px-[7px] text-[12px] font-semibold", isActive ? "bg-white/18 text-cream" : "bg-ink/8 text-ink")}>
                      {newLeads}
                    </span>
                  </>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </LayoutGroup>
  );
}
