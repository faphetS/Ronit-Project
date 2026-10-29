import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { languageNames, LOCALES } from "../../content/copy";
import { useCopy, useLocale } from "../../content/locale";
import { useSecuritySettings, useSession, useSignOut, useUpdateProfile, useUpdateSecuritySwitch, useUsers } from "../../data/queries";
import { cx } from "../../lib/cx";
import { fadeOut, PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { GooButton } from "../../ui/GooButton";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { Ltr } from "../../ui/Ltr";
import { Switch } from "../../ui/Switch";
import { useToast } from "../../ui/toast-context";

type View = "menu" | "profile";

const ROW =
  "flex h-12 w-full items-center gap-3 rounded-[18px] px-3 text-start text-[14.5px] text-cream/90 transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none";
/** A row that holds a control instead of being one. */
const STILL_ROW = "flex h-12 w-full items-center gap-3 px-3 text-[14.5px] text-cream/90";

function RowIcon({ name }: { name: IconName }) {
  return <Icon name={name} size={20} className="shrink-0 text-cream/55" />;
}

function Chevron() {
  return <Icon name="forward" size={16} className="shrink-0 text-cream/35" />;
}

function Divider() {
  return <div aria-hidden="true" className="mx-2 my-1.5 h-px bg-white/[0.08]" />;
}

/** The two languages as a small segmented control on the dark panel. */
function LanguageToggle({ label }: { label: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div role="group" aria-label={label} className="flex shrink-0 rounded-full bg-white/[0.07] p-0.5">
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
            locale === value ? "bg-cream text-ink" : "text-cream/60 hover:text-cream",
          )}
        >
          {languageNames[value].short}
        </button>
      ))}
    </div>
  );
}

function DarkField({ label, error, ...input }: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <label htmlFor={id} className="text-caption text-cream/55">
        {label}
      </label>
      <input
        id={id}
        {...input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 rounded-[14px] bg-white/[0.07] px-3.5 text-[14.5px] text-cream ring-1 ring-white/10 outline-none ring-inset focus:ring-gold/60"
      />
      {error ? (
        <p id={`${id}-error`} className="text-caption text-gold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ronit's own name and email, saved from the panel. */
function ProfileView({ name, email, onBack }: { name: string; email: string; onBack: () => void }) {
  const { nav } = useCopy();
  const copy = nav.accountMenu;
  const update = useUpdateProfile();
  const toast = useToast();
  const [missing, setMissing] = useState(false);
  const first = useRef<HTMLDivElement>(null);

  useEffect(() => {
    first.current?.querySelector("input")?.focus();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextName = String(form.get("name") ?? "").trim();
    const nextEmail = String(form.get("email") ?? "").trim();
    setMissing(!nextName);
    if (!nextName) return;
    update.mutate(
      { name: nextName, email: nextEmail || undefined },
      {
        onSuccess: () => {
          toast.show({ message: copy.saved });
          onBack();
        },
        onError: () => toast.show({ message: copy.saveFailed, tone: "warning" }),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-1">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onBack} aria-label={nav.back} className="grid size-10 place-items-center rounded-full text-cream/70 transition-colors hover:bg-white/[0.07]">
          <Icon name="back" size={18} />
        </button>
        <h2 className="text-[15px] font-medium text-cream">{copy.profile}</h2>
      </div>
      <div ref={first}>
        <DarkField label={copy.name} name="name" defaultValue={name} autoComplete="name" error={missing ? copy.nameMissing : undefined} />
      </div>
      <DarkField label={copy.email} name="email" type="email" dir="ltr" defaultValue={email} autoComplete="email" />
      <div className="flex justify-end pt-1">
        <GooButton type="submit" tone="light" size="sm" icon="check" disabled={update.isPending}>
          {copy.save}
        </GooButton>
      </div>
    </form>
  );
}

/**
 * Ronit's avatar at the foot of the rail, and the account panel it opens: dark glass over the page, like the rail it
 * comes from. It holds her details, the team, the Monday import, the language, hiding passport numbers, and signing
 * out. Escape, a click outside or a new page closes it.
 */
export function AccountMenu() {
  const { common, nav, usersCopy } = useCopy();
  const copy = nav.accountMenu;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const users = useUsers();
  const security = useSecuritySettings();
  const updateSwitch = useUpdateSecuritySwitch();
  const signOut = useSignOut();
  // Open on the page it was opened on: going to another page closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [view, setView] = useState<View>("menu");
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = openAt === pathname;

  const user = session.data?.user;
  const name = user?.name ?? common.owner;
  const account = users.data?.users.find((member) => member.id === user?.id);
  const masked = security.data?.maskPassportNumbers;

  const close = () => setOpenAt(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
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
          setView("menu");
          setOpenAt(open ? null : pathname);
        }}
        className="rounded-full"
      >
        <Avatar initial={user?.initial ?? common.owner.charAt(0)} gold size="md" />
      </motion.button>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panel}
            role="dialog"
            aria-label={copy.label}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: springs.ui }}
            exit={{ opacity: 0, scale: 0.97, transition: fadeOut }}
            className="account-panel absolute start-full bottom-0 z-30 ms-4 w-[320px] origin-bottom-left rounded-[28px] p-2.5 text-cream outline-none rtl:origin-bottom-right"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: springs.ui }} exit={{ opacity: 0, transition: fadeOut }}>
                {view === "profile" ? (
                  <ProfileView
                    name={name}
                    email={account?.email ?? ""}
                    onBack={() => {
                      setView("menu");
                      panel.current?.focus();
                    }}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-3 px-2 pt-1.5 pb-3">
                      <Avatar initial={user?.initial ?? common.owner.charAt(0)} gold size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-cream">{name}</p>
                        {account ? (
                          <p className="truncate text-small text-cream/50">
                            <Ltr>{account.email}</Ltr>
                          </p>
                        ) : null}
                      </div>
                      {user ? (
                        <span className="shrink-0 rounded-lg border border-gold/45 px-2 py-1 text-[11.5px] leading-none font-semibold text-gold">
                          {usersCopy.roles[user.role]}
                        </span>
                      ) : null}
                    </div>
                    <Divider />
                    <button type="button" onClick={() => setView("profile")} className={ROW}>
                      <RowIcon name="user" />
                      <span className="flex-1">{copy.profile}</span>
                      <Chevron />
                    </button>
                    <Link to="/users" onClick={close} className={ROW}>
                      <RowIcon name="users" />
                      <span className="flex-1">{copy.team}</span>
                      {users.data ? <span className="text-cream/45">{users.data.users.length}</span> : null}
                      <Chevron />
                    </Link>
                    <Link to="/import" onClick={close} className={ROW}>
                      <RowIcon name="import" />
                      <span className="flex-1">{copy.import}</span>
                      <Chevron />
                    </Link>
                    <Divider />
                    <div className={STILL_ROW}>
                      <RowIcon name="globe" />
                      <span className="flex-1">{copy.language}</span>
                      <LanguageToggle label={copy.language} />
                    </div>
                    {masked === undefined ? null : (
                      <div className={STILL_ROW}>
                        <RowIcon name="lock" />
                        <span className="flex-1">{copy.maskPassports}</span>
                        <Switch checked={masked} onChange={(enabled) => updateSwitch.mutate({ key: "maskPassportNumbers", enabled })} label={copy.maskPassports} onDark />
                      </div>
                    )}
                    <Divider />
                    <button
                      type="button"
                      onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) })}
                      className={ROW}
                    >
                      <RowIcon name="signOut" />
                      <span className="flex-1">{copy.signOut}</span>
                    </button>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
