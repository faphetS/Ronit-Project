import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { useShell } from "../../app/useShell";
import logoUrl from "../../assets/logo.png";
import { useCopy } from "../../content/locale";
import { useSignIn } from "../../data/queries";
import { today } from "../../lib/clock";
import { staggerVariants } from "../../motion/variants";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { LanguageSwitch } from "../../ui/LanguageSwitch";
import { Scene } from "../../ui/Scene";
import { Surface } from "../../ui/Surface";
import { TodayCard } from "../shared/TodayCard";

type Notice = "forgot" | "help" | null;

// The demo takes any email and password, or none: the button alone signs in as Ronit.
const DEMO_EMAIL = "ronit@orhazadik.online";
const DEMO_PASSWORD = "demo";

/** Sign in, composed like the reference: the frosted card, the black card and the tall orb card. */
export function SignInScreen() {
  const { common, signIn: copy } = useCopy();
  const phone = useShell() === "phone";
  const navigate = useNavigate();
  const location = useLocation();
  const signInMutation = useSignIn();
  const [notice, setNotice] = useState<Notice>(null);
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim() || DEMO_EMAIL;
    const password = String(form.get("password") ?? "") || DEMO_PASSWORD;
    signInMutation.mutate({ email, password }, { onSuccess: () => navigate(returnTo, { replace: true }) });
  };

  const message = signInMutation.isError ? copy.failed : notice === "forgot" ? copy.forgotNotice : notice === "help" ? copy.helpNotice : "";

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Scene preset={phone ? "phone" : "login"} />
      <LanguageSwitch className="absolute end-4 top-4 z-10 lg:end-6 lg:top-6" />
      <motion.main
        initial="initial"
        animate="enter"
        variants={staggerVariants}
        className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-[18px] py-10 lg:grid lg:grid-cols-[440px_380px] lg:content-center lg:items-stretch lg:gap-5 lg:px-5 lg:py-8"
      >
        <img src={logoUrl} alt={common.brandFull} className="w-24 lg:hidden" />
        <div className="flex w-full max-w-[440px] flex-col gap-4 lg:gap-5">
          <Surface variant="glass" compact={phone} aria-label={copy.title} className="lg:px-[30px] lg:pt-[26px] lg:pb-[26px]">
            <div className="flex items-center justify-between">
              <p className="text-mute-2">{copy.brand}</p>
              <button type="button" onClick={() => setNotice("help")} className="text-small font-medium text-ink underline decoration-ink/30 underline-offset-4">
                {copy.help}
              </button>
            </div>
            <Headline title={copy.title} size="display-3" className="mt-5 mb-4" />
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <Field label={copy.email} icon="at" name="email" type="email" autoComplete="username" />
              <Field
                label={copy.password}
                icon="key"
                name="password"
                type="password"
                autoComplete="current-password"
                trailing={
                  <button type="button" onClick={() => setNotice("forgot")} className="inline-flex h-[42px] items-center rounded-full bg-paper px-4 text-small font-medium text-ink">
                    {copy.forgot}
                  </button>
                }
              />
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2.5 px-2 text-small text-mute-2">
                  <input type="checkbox" name="remember" defaultChecked className="size-[18px] accent-ink" />
                  {copy.remember}
                </label>
                <GooButton type="submit" disabled={signInMutation.isPending}>
                  {copy.submit}
                </GooButton>
              </div>
            </form>
            <p role="status" className="mt-3 text-center text-caption text-ink empty:mt-0">
              {message}
            </p>
          </Surface>
          <Surface variant="ink" compact={phone} aria-label={copy.allInOne.title} className="flex flex-1 flex-col justify-between gap-4 lg:min-h-[220px]">
            <Headline title={copy.allInOne.title} soft={copy.allInOne.soft} size="display-3" level={2} onDark />
            <p className="hidden text-end text-small text-ink-mute lg:block">{copy.allInOne.line}</p>
          </Surface>
        </div>
        <div className="hidden w-[380px] lg:block">
          <TodayCard
            day={today()}
            label={copy.today}
            size="tall"
            className="h-full"
            footer={
              <>
                <p className="text-small text-copy">{copy.greetingsOnTheWay}</p>
                <span className="flex-1" />
                <img src={logoUrl} alt="" className="w-[84px] self-center" />
              </>
            }
            side={
              <>
                <p className="text-small text-mute">
                  {copy.system.first}
                  <br />
                  {copy.system.second}
                </p>
                <a href={copy.site.url} className="text-caption font-medium text-ink underline decoration-ink/30 underline-offset-4">
                  {copy.site.label}
                </a>
              </>
            }
          />
        </div>
      </motion.main>
    </div>
  );
}
