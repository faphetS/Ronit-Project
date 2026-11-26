import { useLocation, useNavigate } from "react-router";
import logoUrl from "../../assets/logo.png";
import { useCopy } from "../../content/locale";
import { useScreenPath } from "../../motion/screen-path";
import { IconButton } from "../../ui/IconButton";
import { NotificationsSheet } from "../notifications/NotificationsSheet";
import { PhoneAccountSheet } from "./PhoneAccountSheet";
import { isPushedRoute, parentOf } from "../sections";
import { useNavBadges } from "../useNavBadges";

/**
 * Top of a phone screen: the avatar (it opens the settings, the language among them), the logo and the bell (it opens
 * the notifications) on top-level screens, each in a sheet; a back arrow and a title on pushed ones.
 */
export function PhoneTopBar({ title }: { title?: string }) {
  const location = useLocation();
  // The screen's own path: while a screen slides out, its header must not turn into the next screen's.
  const screenPath = useScreenPath();
  const navigate = useNavigate();
  const badges = useNavBadges();
  const { common, nav } = useCopy();

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

  // Three columns keep the logo centered between the avatar and the bell.
  return (
    <header className="grid min-h-[52px] grid-cols-[1fr_auto_1fr] items-center gap-2.5">
      <PhoneAccountSheet />
      <img src={logoUrl} alt={common.brandFull} className="w-14" />
      <div className="flex items-center gap-2 justify-self-end">
        <NotificationsSheet count={badges.notifications} />
      </div>
    </header>
  );
}
