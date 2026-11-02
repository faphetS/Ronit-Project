import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useShell } from "../../app/useShell";
import logoUrl from "../../assets/logo.png";
import { useCopy } from "../../content/locale";
import { today } from "../../lib/clock";
import { staggerVariants } from "../../motion/variants";
import { Headline } from "../../ui/Headline";
import { LanguageSwitch } from "../../ui/LanguageSwitch";
import { Scene } from "../../ui/Scene";
import { Surface } from "../../ui/Surface";
import { TodayCard } from "../shared/TodayCard";

interface SignInLayoutProps {
  /** Names the frosted card for screen readers. */
  label: string;
  /** The status line under the card's content: a refusal, or a notice. */
  message: string;
  onHelp: () => void;
  children: ReactNode;
}

/** Composed like the reference: the frosted card (whatever step is showing), the black card and the tall orb card. */
export function SignInLayout({ label, message, onHelp, children }: SignInLayoutProps) {
  const { common, signIn: copy } = useCopy();
  const phone = useShell() === "phone";
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
          <Surface variant="glass" compact={phone} aria-label={label} className="lg:px-[30px] lg:pt-[26px] lg:pb-[26px]">
            <div className="flex items-center justify-between">
              <p className="text-mute-2">{copy.brand}</p>
              <button type="button" onClick={onHelp} className="text-small font-medium text-ink underline decoration-ink/30 underline-offset-4">
                {copy.help}
              </button>
            </div>
            {children}
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
