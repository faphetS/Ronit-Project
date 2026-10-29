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
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { MotionLink } from "../../ui/MotionLink";
import { usePrefetchSection } from "../prefetch";
import { DESKTOP_NAV, type RailKey } from "../sections";

interface RailItemProps {
  to: string;
  icon: IconName;
  /** Accessible name. Include whatever the dot stands for. */
  label: string;
  /** The name that appears beside the rail on hover. */
  name: string;
  /** A small gold dot for something new. */
  dot?: boolean;
  active: boolean;
  register: (element: HTMLElement | null) => void;
  onHover: () => void;
}

function RailItem({ to, icon, label, name, dot = false, active, register, onHover }: RailItemProps) {
  return (
    <MotionLink
      ref={register}
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onPointerEnter={onHover}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className={cx("group relative z-10 grid size-12 place-items-center rounded-full transition-colors duration-300", active ? "text-ink" : "text-cream/55 hover:text-cream")}
    >
      <Icon name={icon} size={22} />
      {dot ? <span aria-hidden="true" className="absolute end-2 top-2 size-2 rounded-full bg-gold" /> : null}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute start-full top-1/2 ms-6 -translate-y-1/2 rounded-full bg-paper px-3 py-1.5 text-small font-medium whitespace-nowrap text-ink opacity-0 shadow-button transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
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
  newLeads: number;
}

/**
 * The rail on the dark frame at the screen's start edge, as in the reference: the logo, the six sections,
 * settings at the foot, and Ronit's avatar to sign out. The content panel reaches out to the current item
 * (see LiquidPanel); a bead of water follows the pointer.
 */
export function Rail({ items, active, newLeads }: RailProps) {
  const { common, nav } = useCopy();
  const session = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [hover, setHover] = useState<{ key: RailKey; on: boolean } | null>(null);
  const prefetch = usePrefetchSection();
  const user = session.data?.user;

  const itemProps = (key: RailKey) => ({
    active: key === active,
    register: (element: HTMLElement | null) => {
      if (element) items.current.set(key, element);
      else items.current.delete(key);
    },
    onHover: () => {
      setHover({ key, on: true });
      prefetch(key);
    },
  });

  return (
    <div className="relative z-20 flex w-[88px] shrink-0 flex-col items-center py-6">
      <img src={logoUrl} alt={common.brandFull} className="size-14 object-contain" />
      <div className="relative mt-14 mb-5 flex flex-1 flex-col items-center" onPointerLeave={() => setHover((last) => last && { ...last, on: false })}>
        <nav aria-label={nav.main} className="flex flex-col items-center gap-[clamp(14px,3vh,24px)]">
          {DESKTOP_NAV.map((section) => {
            const name = nav.items[section.key];
            const fresh = section.key === "leads" && newLeads > 0;
            return (
              <RailItem
                key={section.key}
                to={section.to}
                icon={section.icon}
                label={fresh ? nav.withNew(name, newLeads) : name}
                name={name}
                dot={fresh}
                {...itemProps(section.key)}
              />
            );
          })}
        </nav>
        <span className="flex-1" />
        <nav aria-label={nav.tools}>
          <RailItem to="/users" icon="settings" label={nav.users} name={nav.users} {...itemProps("settings")} />
        </nav>
        <LiquidDrop axis="y" items={items} target={hover?.key ?? null} visible={hover?.on === true && hover.key !== active} className="liquid-bead rounded-full" />
      </div>
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
