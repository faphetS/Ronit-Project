import { motion } from "motion/react";
import { useState, type RefObject } from "react";
import { useNavigate } from "react-router";
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
import { DESKTOP_NAV, type RailKey, type RailToolKey } from "../sections";

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
      className={cx("group relative grid size-[42px] place-items-center rounded-full transition-colors duration-300", active ? "text-ink" : "text-mute hover:text-ink")}
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

interface RailProps {
  /** Every item registers here, so the panel can find the current one. */
  items: RefObject<Map<RailKey, HTMLElement>>;
  active: RailKey | null;
  passportsToday: number;
  newLeads: number;
}

/**
 * The rail at the screen's start edge: the logo, the sections, the tools, and Ronit's avatar to sign out.
 * The content panel reaches out to the current item (see LiquidPanel); a bead of water follows the pointer.
 */
export function Rail({ items, active, passportsToday, newLeads }: RailProps) {
  const { common, nav } = useCopy();
  const session = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [hover, setHover] = useState<{ key: RailKey; on: boolean } | null>(null);
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
    <div className="relative z-20 flex w-[76px] shrink-0 flex-col items-center py-5">
      <img src={logoUrl} alt={common.brandFull} className="mb-4 size-[50px] object-contain" />
      <div className="relative flex flex-col items-center" onPointerLeave={() => setHover((last) => last && { ...last, on: false })}>
        <LiquidDrop axis="y" items={items} target={hover?.key ?? null} visible={hover?.on === true && hover.key !== active} className="liquid-bead rounded-full" />
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
