import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { languageNames, LOCALES } from "../../content/copy";
import { useCopy, useDirection, useLocale } from "../../content/locale";
import { ApiError } from "../../data/http/client";
import { useSecuritySettings, useSession, useSignOut, useUpdateProfile, useUpdateSecuritySwitch, useUsers } from "../../data/queries";
import { cx } from "../../lib/cx";
import { fadeOut, PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { Ltr } from "../../ui/Ltr";
import { Switch } from "../../ui/Switch";
import { useToast } from "../../ui/toast-context";
import { OwnPasswordForm } from "../../screens/users/OwnPasswordForm";

type View = "settings" | "profile" | "password";

const PRESSABLE = "transition-colors hover:bg-sand-light active:bg-line focus-visible:bg-sand-light focus-visible:outline-none";
const HAIRLINE = "border-t border-line";
const ROW = cx("flex w-full items-center gap-3 ps-3", PRESSABLE);
const STILL_ROW = "flex w-full items-center gap-3 ps-3";

/** Views slide a little toward where they go, and fade. `shift` is +1 into the panel, -1 back out, flipped in RTL. */
const SLIDE: Variants = {
  from: (shift: number) => ({ opacity: 0, x: 18 * shift }),
  at: { opacity: 1, x: 0, transition: springs.ui },
  to: (shift: number) => ({ opacity: 0, x: -18 * shift, transition: fadeOut }),
};

/** A row's icon on a small sand tile, or a warm red one for signing out. */
function Tile({ icon, warning = false }: { icon: IconName; warning?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid size-8 shrink-0 place-items-center rounded-[10px]",
        warning ? "bg-status-warning/10 text-status-warning" : "bg-sand-light text-ink ring-1 ring-black/[0.04] ring-inset",
      )}
    >
      <Icon name={icon} size={17} />
    </span>
  );
}

function Chevron() {
  return <Icon name="forward" size={14} className="shrink-0 text-mute/50" />;
}

/** One group of rows on a white card. */
function Group({ children }: { children: ReactNode }) {
  return <div className="overflow-clip rounded-[20px] bg-white/90 ring-1 ring-black/[0.04]">{children}</div>;
}

interface RowBodyProps {
  icon: IconName;
  label: string;
  value?: ReactNode;
  trailing?: ReactNode;
  first?: boolean;
  warning?: boolean;
}

/** A row's insides: the tile, then the label and what trails it, over a hairline that starts at the label. */
function RowBody({ icon, label, value, trailing, first = false, warning = false }: RowBodyProps) {
  return (
    <>
      <Tile icon={icon} warning={warning} />
      <span className={cx("flex min-h-12 min-w-0 flex-1 items-center gap-2 pe-3.5", !first && HAIRLINE)}>
        <span className={cx("min-w-0 flex-1 truncate text-start text-[14.5px]", warning ? "text-status-warning" : "text-ink")}>{label}</span>
        {value === undefined ? null : <span className="shrink-0 text-[14px] text-mute">{value}</span>}
        {trailing}
      </span>
    </>
  );
}

/** The two languages as a small segmented control. */
function LanguageToggle({ label }: { label: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div role="group" aria-label={label} className="flex shrink-0 rounded-full bg-sand-light p-0.5 ring-1 ring-black/[0.04] ring-inset">
      {LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={locale === value}
          aria-label={languageNames[value].full}
          onClick={() => setLocale(value)}
          className={cx(
            "h-8 min-w-11 rounded-full px-2.5 text-[13px] font-medium transition-colors",
            locale === value ? "bg-ink text-cream" : "text-mute hover:text-ink",
          )}
        >
          {languageNames[value].short}
        </button>
      ))}
    </div>
  );
}

/**
 * Your own name and WhatsApp number (test greetings go to it), saved with the joined button. The email is the
 * Google account you sign in with, so it only shows.
 */
function ProfileView({ name, email, phone, onBack }: { name: string; email: string; phone: string; onBack: () => void }) {
  const { nav } = useCopy();
  const copy = nav.accountMenu;
  const update = useUpdateProfile();
  const toast = useToast();
  const [draft, setDraft] = useState({ name, phone });
  const fields = useRef<HTMLDivElement>(null);
  const valid = draft.name.trim().length > 0;

  useEffect(() => {
    fields.current?.querySelector("input")?.focus({ preventScroll: true });
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    update.mutate(
      { name: draft.name.trim(), whatsappPhone: draft.phone.trim() },
      {
        onSuccess: () => {
          toast.show({ message: copy.saved });
          onBack();
        },
        onError: (error) =>
          toast.show({ message: error instanceof ApiError && error.code === "INVALID_PHONE" ? copy.phoneInvalid : copy.saveFailed, tone: "warning" }),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-2.5">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label={nav.back} className={cx("grid size-9 place-items-center rounded-full text-ink", PRESSABLE)}>
          <Icon name="back" size={18} />
        </button>
        <h2 className="text-[15px] font-semibold text-ink">{copy.profile}</h2>
      </div>
      <div className="flex justify-center">
        <Avatar initial={(draft.name.trim() || name).charAt(0)} gold size="lg" />
      </div>
      <div ref={fields} className="flex flex-col gap-2">
        <Field label={copy.name} icon="user" name="name" autoComplete="name" size="sm" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
        <Field
          label={copy.phone}
          icon="phone"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          size="sm"
          value={draft.phone}
          onChange={(value) => setDraft({ ...draft, phone: value })}
        />
        <p className="px-2 text-caption text-mute">{copy.phoneNote}</p>
        <div className="px-2 pt-1">
          <p className="text-caption text-mute">{copy.email}</p>
          <p className="text-small text-ink" dir="ltr">
            {email}
          </p>
          <p className="mt-1 text-caption text-mute">{copy.emailNote}</p>
        </div>
      </div>
      <div className="flex justify-end pt-1">
        <GooButton type="submit" size="sm" icon="check" disabled={!valid || update.isPending}>
          {copy.save}
        </GooButton>
      </div>
    </form>
  );
}

/** Your own password: the current one, then the new one. Saved, it goes back to the settings. */
function PasswordView({ onBack }: { onBack: () => void }) {
  const { nav, usersCopy } = useCopy();
  return (
    <div className="flex flex-col gap-3 p-2.5">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label={nav.back} className={cx("grid size-9 place-items-center rounded-full text-ink", PRESSABLE)}>
          <Icon name="back" size={18} />
        </button>
        <h2 className="text-[15px] font-semibold text-ink">{usersCopy.password.title}</h2>
      </div>
      <OwnPasswordForm size="sm" onDone={onBack} />
    </div>
  );
}

/** The height of an element as it changes, so a box around it can animate to fit. */
function useHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

/**
 * Ronit's avatar at the foot of the rail, and the settings panel it opens, after the grouped settings of Apple's
 * systems but in the dashboard's own warm glass: her profile on top, the team and the Monday import, the language and
 * hiding passport numbers, and signing out on its own. Her details open in the panel. Escape, a click outside or a
 * new page closes it.
 */
export function AccountMenu() {
  const { common, nav, usersCopy } = useCopy();
  const copy = nav.accountMenu;
  const rtl = useDirection() === "rtl";
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const users = useUsers();
  const security = useSecuritySettings();
  const updateSwitch = useUpdateSecuritySwitch();
  const signOut = useSignOut();
  // Open on the page it was opened on: going to another page closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [view, setView] = useState<View>("settings");
  const [content, height] = useHeight();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = openAt === pathname;

  const user = session.data?.user;
  const name = user?.name ?? common.owner;
  const initial = user?.initial ?? common.owner.charAt(0);
  const me = users.data?.users.find((member) => member.id === user?.id);
  const email = me?.email ?? "";
  const masked = security.data?.maskPassportNumbers;
  const shift = (view === "settings" ? -1 : 1) * (rtl ? -1 : 1);

  const close = () => setOpenAt(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenAt(null);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpenAt(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const settings = (
    <div className="flex flex-col gap-2.5 p-2.5">
      <button type="button" onClick={() => setView("profile")} className={cx("flex w-full items-center gap-3 rounded-[20px] p-2.5", PRESSABLE)}>
        <Avatar initial={initial} gold size="md" />
        <span className="min-w-0 flex-1 text-start">
          <span className="block truncate text-[16px] font-medium text-ink">{name}</span>
          {email ? (
            <span className="block truncate text-[13px] text-mute">
              <Ltr>{email}</Ltr>
            </span>
          ) : null}
        </span>
        {user ? <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-1 text-[12px] leading-none font-medium text-ink">{usersCopy.roles[user.role]}</span> : null}
        <Chevron />
      </button>
      <Group>
        <Link to="/users" onClick={close} className={ROW}>
          <RowBody icon="users" label={copy.team} value={users.data?.users.length} trailing={<Chevron />} first />
        </Link>
        <Link to="/import" onClick={close} className={ROW}>
          <RowBody icon="import" label={copy.import} trailing={<Chevron />} />
        </Link>
      </Group>
      <Group>
        <div className={STILL_ROW}>
          <RowBody icon="globe" label={copy.language} trailing={<LanguageToggle label={copy.language} />} first />
        </div>
        {/* Only a password the office set can be changed here; without one, the row just says so. */}
        {me?.hasPassword ? (
          <button type="button" onClick={() => setView("password")} className={ROW}>
            <RowBody icon="key" label={copy.password} value={copy.passwordSet} trailing={<Chevron />} />
          </button>
        ) : me ? (
          <div className={STILL_ROW}>
            <RowBody icon="key" label={copy.password} value={copy.passwordNotSet} />
          </div>
        ) : null}
        {masked === undefined ? null : (
          <div className={STILL_ROW}>
            <RowBody
              icon="lock"
              label={copy.maskPassports}
              trailing={<Switch checked={masked} onChange={(enabled) => updateSwitch.mutate({ key: "maskPassportNumbers", enabled })} label={copy.maskPassports} />}
            />
          </div>
        )}
      </Group>
      <Group>
        <button type="button" onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) })} className={ROW}>
          <RowBody icon="signOut" label={copy.signOut} warning first />
        </button>
      </Group>
    </div>
  );

  return (
    <div className="relative">
      <motion.button
        ref={button}
        type="button"
        aria-label={nav.account(name)}
        aria-haspopup="dialog"
        aria-expanded={open}
        whileTap={{ scale: PRESS_SCALE }}
        transition={springs.ui}
        onClick={() => {
          setView("settings");
          setOpenAt(open ? null : pathname);
        }}
        className="rounded-full"
      >
        <Avatar initial={initial} gold size="md" />
      </motion.button>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panel}
            role="dialog"
            aria-label={copy.title}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: springs.ui }}
            exit={{ opacity: 0, scale: 0.97, transition: fadeOut }}
            className="account-panel absolute start-full bottom-0 z-30 ms-4 w-[360px] origin-bottom-left overflow-clip rounded-[28px] outline-none rtl:origin-bottom-right"
          >
            {/* The box follows its view's height. One view at a time, so they never show through each other. */}
            <motion.div animate={{ height }} transition={springs.ui}>
              <div ref={content}>
                <AnimatePresence mode="wait" initial={false} custom={shift}>
                  <motion.div key={view} custom={shift} variants={SLIDE} initial="from" animate="at" exit="to">
                    {view === "profile" ? (
                      <ProfileView name={name} email={email} phone={me?.whatsappPhone ?? ""} onBack={() => setView("settings")} />
                    ) : view === "password" ? (
                      <PasswordView onBack={() => setView("settings")} />
                    ) : (
                      settings
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
