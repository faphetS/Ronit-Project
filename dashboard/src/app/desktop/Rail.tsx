import { motion } from "motion/react";
import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import logoUrl from "../../assets/logo.png";
import { useCopy } from "../../content/locale";
import { useSession, useSignOut } from "../../data/queries";
import { cx } from "../../lib/cx";
import { LiquidDrop } from "../../motion/LiquidDrop";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { CountBadge } from "../../ui/CountBadge";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { MotionLink } from "../../ui/MotionLink";
import { DESKTOP_NAV, railKeyFor, type RailKey, type RailToolKey } from "../sections";

interface RailItemProps {
  to: string;
  icon: IconName;
  /** Accessible name. Include any count the badge shows. */
  label: string;
  /** The name that appears beside the rail on hover. */
  name: string;
  badge?: number;
  active: boolean;
  register: (element: HTMLElement | null) => void;
  onHover: () => void;
}

function RailItem({ to, icon, label, name, badge, active, register, onHover }: RailItemProps) {
  return (
    <MotionLink
      ref={register}
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onPointerEnter={onHover}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className={cx("group relative grid size-[42px] place-items-center rounded-full transition-colors duration-300", active ? "text-cream" : "text-copy hover:text-ink")}
    >
      <Icon name={icon} />
      {badge ? <CountBadge count={badge} /> : null}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute start-full top-1/2 ms-3 -translate-y-1/2 rounded-full bg-paper px-3 py-1.5 text-small font-medium whitespace-nowrap text-ink opacity-0 shadow-button transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        {name}
      </span>
    </MotionLink>
  );
}

/**
 * The glass rail at the start side: the logo, the sections, the tools, and Ronit's avatar to sign out.
 * An ink drop flows to the current item, and a bead of water follows the pointer.
 */
export function Rail({ passportsToday, newLeads }: { passportsToday: number; newLeads: number }) {
  const { common, nav } = useCopy();
  const { pathname } = useLocation();
  const session = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const items = useRef(new Map<RailKey, HTMLElement>());
  const [hover, setHover] = useState<{ key: RailKey; on: boolean } | null>(null);
  const active = railKeyFor(pathname);
  const user = session.data?.user;

  const itemProps = (key: RailKey) => ({
    active: key === active,
    register: (element: HTMLElement | null) => {
      if (element) items.current.set(key, element);
      else items.current.delete(key);
    },
    onHover: () => setHover({ key, on: true }),
  });

  const tools: Array<{ key: RailToolKey; to: string; icon: IconName; label: string; badge?: number }> = [
    { key: "whatsapp", to: "/customers?filter=whatsapp", icon: "chat", label: nav.whatsappPassports(passportsToday), badge: passportsToday },
    { key: "import", to: "/import", icon: "import", label: nav.import },
    { key: "history", to: "/greetings/holidays#history", icon: "history", label: nav.history },
    { key: "users", to: "/users", icon: "users", label: nav.users },
  ];

  return (
    <div className="surface-glass relative z-10 mb-5 flex w-[72px] shrink-0 flex-col items-center self-stretch rounded-[36px] py-3.5">
      <img src={logoUrl} alt={common.brandFull} className="mb-3 w-[52px]" />
      <div className="relative flex flex-col items-center" onPointerLeave={() => setHover((last) => last && { ...last, on: false })}>
        <LiquidDrop axis="y" items={items} target={hover?.key ?? null} visible={hover?.on === true && hover.key !== active} className="liquid-bead rounded-full" />
        <LiquidDrop axis="y" items={items} target={active} className="liquid-drop rounded-full" />
        <nav aria-label={nav.main} className="flex flex-col items-center gap-0.5">
          {DESKTOP_NAV.map((section) => {
            const name = nav.items[section.key];
            const count = section.key === "leads" && newLeads > 0 ? newLeads : undefined;
            return (
              <RailItem
                key={section.key}
                to={section.to}
                icon={section.icon}
                label={count ? nav.withNew(name, count) : name}
                name={name}
                badge={count}
                {...itemProps(section.key)}
              />
            );
          })}
        </nav>
        <span aria-hidden="true" className="my-2.5 h-px w-7 bg-ink/10" />
        <nav aria-label={nav.tools} className="flex flex-col items-center gap-0.5">
          {tools.map((tool) => (
            <RailItem key={tool.key} to={tool.to} icon={tool.icon} label={tool.label} name={tool.label} badge={tool.badge} {...itemProps(tool.key)} />
          ))}
        </nav>
      </div>
      <span className="flex-1" />
      <motion.button
        type="button"
        aria-label={nav.signOut(user?.name ?? common.owner)}
        whileTap={{ scale: PRESS_SCALE }}
        transition={springs.ui}
        onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) })}
        className="rounded-full"
      >
        <Avatar initial={user?.initial ?? common.owner.charAt(0)} gold size="md" />
      </motion.button>
    </div>
  );
}
