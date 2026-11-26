import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useCopy } from "../../content/locale";
import { useSession, useSignOut, useUsers } from "../../data/queries";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { Ltr } from "../../ui/Ltr";
import { Sheet } from "../../ui/Sheet";
import { ROW, STILL_ROW } from "../account/settings-rows";
import { Chevron, LanguageToggle, RowBody, SettingsGroup } from "../account/SettingsRows";

/**
 * The avatar on a phone's top bar, and the settings it opens in a sheet, in the rows of the desktop's panel: who is
 * signed in, the team and your own account, the language, and signing out. Following a row closes the sheet.
 */
export function PhoneAccountSheet() {
  const { common, nav, usersCopy } = useCopy();
  const copy = nav.accountMenu;
  const navigate = useNavigate();
  const session = useSession();
  const users = useUsers();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const user = session.data?.user;
  const name = user?.name ?? common.owner;
  const me = users.data?.users.find((member) => member.id === user?.id);

  return (
    <>
      <motion.button
        type="button"
        aria-label={nav.account(name)}
        aria-haspopup="dialog"
        aria-expanded={open}
        whileTap={{ scale: PRESS_SCALE }}
        transition={springs.ui}
        onClick={() => setOpen(true)}
        className="justify-self-start rounded-full"
      >
        <Avatar initial={user?.initial ?? common.owner.charAt(0)} gold size="md" />
      </motion.button>
      <Sheet open={open} onClose={close} title={copy.title}>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3 px-1">
            <Avatar initial={user?.initial ?? common.owner.charAt(0)} gold size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-medium text-ink">{name}</span>
              {me?.email ? (
                <span className="block truncate text-[13px] text-mute">
                  <Ltr>{me.email}</Ltr>
                </span>
              ) : null}
            </span>
            {user ? <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-1 text-[12px] leading-none font-medium text-ink">{usersCopy.roles[user.role]}</span> : null}
          </div>
          <SettingsGroup>
            <Link to="/users" onClick={close} className={ROW}>
              <RowBody icon="users" label={copy.team} value={users.data?.users.length} trailing={<Chevron />} first />
            </Link>
          </SettingsGroup>
          <SettingsGroup>
            <div className={STILL_ROW}>
              <RowBody icon="globe" label={copy.language} trailing={<LanguageToggle label={copy.language} />} first />
            </div>
          </SettingsGroup>
          <SettingsGroup>
            <button type="button" onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) })} className={ROW}>
              <RowBody icon="signOut" label={copy.signOut} warning first />
            </button>
          </SettingsGroup>
        </div>
      </Sheet>
    </>
  );
}
