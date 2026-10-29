import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { languageNames, LOCALES } from "../../content/copy";
import { useCopy, useDirection, useLocale } from "../../content/locale";
import { useSecuritySettings, useSession, useSignOut, useUpdateProfile, useUpdateSecuritySwitch, useUsers } from "../../data/queries";
import { cx } from "../../lib/cx";
import { fadeOut, PRESS_SCALE, springs } from "../../motion/springs";
import type { PushDirection } from "../../motion/transitions";
import { screenVariants, type ScreenMotion } from "../../motion/variants";
import { Avatar } from "../../ui/Avatar";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { Ltr } from "../../ui/Ltr";
import { Switch } from "../../ui/Switch";
import { useToast } from "../../ui/toast-context";

type View = "settings" | "profile" | "language";

/** The icon squares, in iOS's system colors. */
const TINT = {
  blue: "bg-[#007aff]",
  orange: "bg-[#ff9500]",
  indigo: "bg-[#5856d6]",
  green: "bg-[#34c759]",
} as const;

/** iOS's tint, for back, save and the checkmark. */
const ACTION = "text-[#007aff]";
const SECONDARY = "text-[#8e8e93]";
const PRESSABLE = "transition-colors hover:bg-black/[0.035] active:bg-black/[0.07] focus-visible:bg-black/[0.05] focus-visible:outline-none";
const ROW = cx("flex w-full items-center gap-3 ps-3", PRESSABLE);
const HAIRLINE = "border-t border-black/[0.08]";

function Squircle({ icon, tint }: { icon: IconName; tint: keyof typeof TINT }) {
  return (
    <span aria-hidden="true" className={cx("grid size-[30px] shrink-0 place-items-center rounded-[8px] text-white", TINT[tint])}>
      <Icon name={icon} size={18} />
    </span>
  );
}

function Chevron() {
  return <Icon name="forward" size={14} className="shrink-0 text-[#c4c4c7]" />;
}

/** One inset group of rows, like a section of iOS Settings. */
function Group({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[14px] bg-white">{children}</div>;
}

/** A row's insides: the icon square, then the label and what trails it over a hairline that starts at the label. */
function RowBody({ icon, tint, label, value, trailing, first = false }: { icon: IconName; tint: keyof typeof TINT; label: string; value?: ReactNode; trailing?: ReactNode; first?: boolean }) {
  return (
    <>
      <Squircle icon={icon} tint={tint} />
      <span className={cx("flex min-h-[46px] min-w-0 flex-1 items-center gap-2 pe-3", !first && HAIRLINE)}>
        <span className="min-w-0 flex-1 truncate text-start text-[15px] text-ink">{label}</span>
        {value === undefined ? null : <span className={cx("shrink-0 text-[15px]", SECONDARY)}>{value}</span>}
        {trailing}
      </span>
    </>
  );
}

/** The bar on top of each view: the title in the middle, back at the start, an action at the end. */
function NavBar({ title, back, action }: { title: string; back?: { label: string; onClick: () => void }; action?: ReactNode }) {
  return (
    <div className="relative flex h-12 items-center justify-center px-2">
      {back ? (
        <button type="button" onClick={back.onClick} className={cx("absolute start-1 flex h-11 items-center gap-0.5 px-1.5 text-[15px]", ACTION)}>
          <Icon name="back" size={18} />
          {back.label}
        </button>
      ) : null}
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {action ? <div className="absolute end-1">{action}</div> : null}
    </div>
  );
}

/** Ronit's own name and email, edited like an iOS form and saved from the bar. */
function ProfileView({ name, email, onBack }: { name: string; email: string; onBack: () => void }) {
  const { nav } = useCopy();
  const copy = nav.accountMenu;
  const update = useUpdateProfile();
  const toast = useToast();
  const [draft, setDraft] = useState({ name, email });
  const nameInput = useRef<HTMLInputElement>(null);
  const valid = draft.name.trim().length > 0;

  useEffect(() => {
    nameInput.current?.focus();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    update.mutate(
      { name: draft.name.trim(), email: draft.email.trim() || undefined },
      {
        onSuccess: () => {
          toast.show({ message: copy.saved });
          onBack();
        },
        onError: () => toast.show({ message: copy.saveFailed, tone: "warning" }),
      },
    );
  };

  const input = "min-w-0 flex-1 bg-transparent text-end text-[15px] text-ink outline-none";
  return (
    <form onSubmit={submit} noValidate>
      <NavBar
        title={copy.profile}
        back={{ label: copy.title, onClick: onBack }}
        action={
          <button type="submit" disabled={!valid || update.isPending} className={cx("h-11 px-2 text-[15px] font-semibold disabled:opacity-35", ACTION)}>
            {copy.save}
          </button>
        }
      />
      <div className="flex justify-center pt-1 pb-4">
        <Avatar initial={(draft.name.trim() || name).charAt(0)} gold size="lg" />
      </div>
      <div className="px-3 pb-3">
        <Group>
          <label className="flex w-full items-center ps-4">
            <span className="flex min-h-[46px] flex-1 items-center gap-3 pe-4">
              <span className="w-20 shrink-0 text-[15px] text-ink">{copy.name}</span>
              <input
                ref={nameInput}
                name="name"
                autoComplete="name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className={input}
              />
            </span>
          </label>
          <label className="flex w-full items-center ps-4">
            <span className={cx("flex min-h-[46px] flex-1 items-center gap-3 pe-4", HAIRLINE)}>
              <span className="w-20 shrink-0 text-[15px] text-ink">{copy.email}</span>
              <input
                name="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                className={cx(input, "rtl:text-left")}
              />
            </span>
          </label>
        </Group>
      </div>
    </form>
  );
}

/** The two languages, the current one checked, as an iOS picker list. */
function LanguageView({ onBack }: { onBack: () => void }) {
  const { nav } = useCopy();
  const copy = nav.accountMenu;
  const { locale, setLocale } = useLocale();
  return (
    <>
      <NavBar title={copy.language} back={{ label: copy.title, onClick: onBack }} />
      <div className="px-3 pb-3">
        <Group>
          {LOCALES.map((value, index) => (
            <button key={value} type="button" lang={value} aria-pressed={locale === value} onClick={() => setLocale(value)} className={cx("flex w-full items-center ps-4", PRESSABLE)}>
              <span className={cx("flex min-h-[46px] flex-1 items-center pe-4", index > 0 && HAIRLINE)}>
                <span className="flex-1 text-start text-[15px] text-ink">{languageNames[value].full}</span>
                {locale === value ? <Icon name="check" size={18} className={ACTION} /> : null}
              </span>
            </button>
          ))}
        </Group>
      </div>
    </>
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
 * Ronit's avatar at the foot of the rail, and the settings panel it opens, laid out like iOS Settings: her profile
 * on top, then grouped rows with colored icons for the team, the Monday import, the language and hiding passport
 * numbers, and sign out on its own. Her details and the language open as pushed views. Escape, a click outside or
 * a new page closes it.
 */
export function AccountMenu() {
  const { common, nav, usersCopy } = useCopy();
  const copy = nav.accountMenu;
  const rtl = useDirection() === "rtl";
  const { locale } = useLocale();
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
  const [direction, setDirection] = useState<PushDirection>("forward");
  const [content, height] = useHeight();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = openAt === pathname;

  const user = session.data?.user;
  const name = user?.name ?? common.owner;
  const initial = user?.initial ?? common.owner.charAt(0);
  const email = users.data?.users.find((member) => member.id === user?.id)?.email ?? "";
  const masked = security.data?.maskPassportNumbers;
  const push: ScreenMotion = { kind: "push", direction, rtl };

  const close = () => setOpenAt(null);
  const go = (next: View) => {
    setDirection(next === "settings" ? "back" : "forward");
    setView(next);
  };

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

  const settings = (
    <>
      <NavBar title={copy.title} />
      <div className="flex flex-col gap-4 px-3 pb-3">
        <Group>
          <button type="button" onClick={() => go("profile")} className={cx("flex w-full items-center gap-3 px-3 py-2.5", PRESSABLE)}>
            <Avatar initial={initial} gold size="md" />
            <span className="min-w-0 flex-1 text-start">
              <span className="block truncate text-[17px] font-medium text-ink">{name}</span>
              <span className={cx("block truncate text-[13px]", SECONDARY)}>
                {user ? usersCopy.roles[user.role] : null}
                {user && email ? " · " : null}
                {email ? <Ltr>{email}</Ltr> : null}
              </span>
            </span>
            <Chevron />
          </button>
        </Group>
        <Group>
          <Link to="/users" onClick={close} className={ROW}>
            <RowBody icon="users" tint="blue" label={copy.team} value={users.data?.users.length} trailing={<Chevron />} first />
          </Link>
          <Link to="/import" onClick={close} className={ROW}>
            <RowBody icon="import" tint="orange" label={copy.import} trailing={<Chevron />} />
          </Link>
        </Group>
        <Group>
          <button type="button" onClick={() => go("language")} className={ROW}>
            <RowBody icon="globe" tint="indigo" label={copy.language} value={languageNames[locale].full} trailing={<Chevron />} first />
          </button>
          {masked === undefined ? null : (
            <div className="flex w-full items-center gap-3 ps-3">
              <RowBody
                icon="lock"
                tint="green"
                label={copy.maskPassports}
                trailing={<Switch system checked={masked} onChange={(enabled) => updateSwitch.mutate({ key: "maskPassportNumbers", enabled })} label={copy.maskPassports} />}
              />
            </div>
          )}
        </Group>
        <Group>
          <button
            type="button"
            onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) })}
            className={cx("flex h-[46px] w-full items-center justify-center text-[15px] text-[#ff3b30]", PRESSABLE)}
          >
            {copy.signOut}
          </button>
        </Group>
      </div>
    </>
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
            className="account-panel absolute start-full bottom-0 z-30 ms-4 w-[340px] origin-bottom-left overflow-hidden rounded-[26px] outline-none rtl:origin-bottom-right"
          >
            {/* The box follows its view's height, while views slide in and out like pushed iOS screens. */}
            <motion.div animate={{ height }} transition={springs.ui}>
              <div ref={content} className="relative">
                <AnimatePresence mode="popLayout" initial={false} custom={push}>
                  <motion.div key={view} custom={push} variants={screenVariants} initial="initial" animate="enter" exit="exit">
                    {view === "profile" ? (
                      <ProfileView name={name} email={email} onBack={() => go("settings")} />
                    ) : view === "language" ? (
                      <LanguageView onBack={() => go("settings")} />
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
