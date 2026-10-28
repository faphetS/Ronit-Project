import { motion } from "motion/react";
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { useCopy } from "../../content/locale";
import { useBirthdays, useBirthdaySettings } from "../../data/queries";
import { cardVariants } from "../../motion/variants";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { AutomationCard, RecentCard, TodayList, TodayOrbCard, WeekCard } from "./BirthdayCards";
import { TemplateCards } from "./BirthdayTemplate";
import { GreetingsSwitch } from "./GreetingsSwitch";
import { SPAN } from "./greetings-model";
import { useScrollToHash } from "./hooks";

/** Birthdays: today, the automation settings, the coming week, the template and recent sends. */
export function BirthdaysScreen() {
  const phone = useShell() === "phone";
  const { greetingsCopy } = useCopy();
  const copy = greetingsCopy.birthdays;
  const settings = useBirthdaySettings();
  const overview = useBirthdays();
  // #template lands once the cards above it have their final height.
  useScrollToHash(!settings.isPending && !overview.isPending);

  return (
    <ScreenFrame>
      {phone ? <PhoneTopBar /> : null}
      {phone ? (
        <GreetingsSwitch current="birthdays" />
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <Headline title={copy.title} soft={copy.soft} size="display" />
          <motion.p variants={cardVariants} className="max-w-[400px] pb-2 text-[16px] leading-[1.55] text-mute">
            {copy.lead}
          </motion.p>
        </div>
      )}

      <div className="grid gap-3.5 lg:grid-cols-12 lg:gap-5">
        <TodayOrbCard phone={phone} className={SPAN.third} />
        <AutomationCard phone={phone} className={SPAN.third} />
        {phone ? <TodayList /> : null}
        <WeekCard phone={phone} className={SPAN.third} />
        <TemplateCards phone={phone} />
        {phone ? null : <RecentCard className={SPAN.third} />}
      </div>
    </ScreenFrame>
  );
}
