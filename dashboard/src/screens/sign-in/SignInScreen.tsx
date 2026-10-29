import { motion } from "motion/react";
import type { FormEvent } from "react";
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

// The demo has no password: the button signs in as Ronit, with or without an email.
const DEMO_EMAIL = "ronit@orhazadik.online";
const DEMO_PASSWORD = "demo";

/** Sign in, composed like the reference: the frosted card, the black card with the logo and the tall orb card. */
export function SignInScreen() {
  const { common, signIn: copy } = useCopy();
  const phone = useShell() === "phone";
  const navigate = useNavigate();
  const location = useLocation();
  const signInMutation = useSignIn();
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim() || DEMO_EMAIL;
    signInMutation.mutate({ email, password: DEMO_PASSWORD }, { onSuccess: () => navigate(returnTo, { replace: true }) });
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Scene preset={phone ? "phone" : "login"} />
      <LanguageSwitch className="absolute end-4 top-4 z-10 lg:end-6 lg:top-6" />
      <motion.main
        initial="initial"
        animate="enter"
        variants={staggerVariants}
        className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-[18px] py-10 lg:flex-row lg:gap-5 lg:px-5 lg:py-8"
      >
        <img src={logoUrl} alt={common.brandFull} className="w-24 lg:hidden" />
        <div className="flex w-full max-w-[440px] flex-col gap-4 lg:h-[600px] lg:gap-5">
          <Surface variant="glass" compact={phone} aria-label={copy.title} className="lg:px-[30px] lg:pt-[30px] lg:pb-[26px]">
            <Headline title={copy.title} size="display-3" className="mb-6" />
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <Field label={copy.email} icon="at" name="email" type="email" autoComplete="username" />
              <GooButton type="submit" disabled={signInMutation.isPending} className="self-end">
                {copy.submit}
              </GooButton>
            </form>
            <p role="status" className="mt-3 text-center text-caption text-ink empty:mt-0">
              {signInMutation.isError ? copy.failed : null}
            </p>
          </Surface>
          <Surface as="div" variant="ink" className="hidden flex-1 place-items-center lg:grid">
            <img src={logoUrl} alt={common.brandFull} className="w-[150px]" />
          </Surface>
        </div>
        <div className="hidden h-[600px] w-[380px] lg:block">
          <TodayCard day={today()} label={copy.today} size="tall" className="h-full" />
        </div>
      </motion.main>
    </div>
  );
}
