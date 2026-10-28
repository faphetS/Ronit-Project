import { motion } from "motion/react";
import { useLocation, useNavigate } from "react-router";
import logoUrl from "../../assets/logo.png";
import { common } from "../../content/common.he";
import { nav } from "../../content/nav.he";
import { useSession, useSignOut } from "../../data/queries";
import { cx } from "../../lib/cx";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { CountBadge } from "../../ui/CountBadge";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { MotionLink } from "../../ui/MotionLink";

interface RailLinkProps {
  to: string;
  icon: IconName;
  label: string;
  badge?: number;
  /** Highlight while its page is open. Only for tools; sections are highlighted in the menu. */
  showActive?: boolean;
}

function RailLink({ to, icon, label, badge, showActive = false }: RailLinkProps) {
  const { pathname } = useLocation();
  const active = showActive && pathname === to;
  return (
    <MotionLink
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className={cx("relative grid size-[52px] place-items-center rounded-full transition-colors", active ? "bg-ink text-cream" : "text-copy hover:bg-white/75 hover:text-ink")}
    >
      <Icon name={icon} />
      {badge ? <CountBadge count={badge} /> : null}
    </MotionLink>
  );
}

/** Glass rail on the right: the logo, tools, and Ronit's avatar to sign out. */
export function Rail({ passportsToday }: { passportsToday: number }) {
  const session = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const user = session.data?.user;
  return (
    <aside aria-label={nav.tools} className="surface-glass mb-5 flex w-[84px] shrink-0 flex-col items-center gap-2 self-stretch rounded-[42px] py-4">
      <img src={logoUrl} alt={common.brandFull} className="mt-0.5 mb-3 w-[62px]" />
      <RailLink to="/customers?filter=whatsapp" icon="chat" label={nav.whatsappPassports(passportsToday)} badge={passportsToday} />
      <RailLink to="/import" icon="import" label={nav.import} showActive />
      <RailLink to="/greetings/holidays#history" icon="history" label={nav.history} />
      <RailLink to="/users" icon="users" label={nav.users} showActive />
      <span className="flex-1" />
      <RailLink to="/users" icon="settings" label={nav.settings} />
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
    </aside>
  );
}
