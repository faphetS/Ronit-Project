import { useLocation, useNavigate } from "react-router";
import logoUrl from "../../assets/logo.png";
import { useCopy } from "../../content/locale";
import { useSession } from "../../data/queries";
import { useScreenPath } from "../../motion/screen-path";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { IconButton } from "../../ui/IconButton";
import { LanguageSwitch } from "../../ui/LanguageSwitch";
import { MotionLink } from "../../ui/MotionLink";
import { isPushedRoute, parentOf } from "../sections";
import { useNavBadges } from "../useNavBadges";

/** Top of a phone screen: avatar, logo, language and bell on top-level screens; a back arrow and a title on pushed ones. */
export function PhoneTopBar({ title }: { title?: string }) {
  const location = useLocation();
  // The screen's own path: while a screen slides out, its header must not turn into the next screen's.
  const screenPath = useScreenPath();
  const navigate = useNavigate();
  const session = useSession();
  const badges = useNavBadges();
  const { common, nav } = useCopy();
  const user = session.data?.user;

  if (isPushedRoute(screenPath)) {
    const goBack = () => {
      // With history inside the app, pop it so the screen slides back. Opened directly, go to the parent.
      if (location.key !== "default") navigate(-1);
      else navigate(parentOf(screenPath), { replace: true, state: { direction: "back" } });
    };
    return (
      <header className="flex min-h-[52px] items-center justify-between gap-2.5">
        <IconButton icon="back" label={nav.back} onClick={goBack} />
        {title ? <p className="text-[16px] font-medium text-ink">{title}</p> : null}
        <span aria-hidden="true" className="size-12" />
      </header>
    );
  }

  // Three columns keep the logo centered with two controls on one side.
  return (
    <header className="grid min-h-[52px] grid-cols-[1fr_auto_1fr] items-center gap-2.5">
      <MotionLink to="/users" aria-label={nav.account(user?.name ?? common.owner)} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui} className="justify-self-start rounded-full">
        <Avatar initial={user?.initial ?? common.owner.charAt(0)} gold size="md" />
      </MotionLink>
      <img src={logoUrl} alt={common.brandFull} className="w-14" />
      <div className="flex items-center gap-2 justify-self-end">
        <LanguageSwitch compact />
        <IconButton icon="bell" label={nav.notifications(badges.notifications)} badge={badges.notifications} />
      </div>
    </header>
  );
}
