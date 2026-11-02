import { motion } from "motion/react";
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { useCopy, useLocale } from "../../content/locale";
import { useAudiences, useCampaignHistory, useCurrentCampaign } from "../../data/queries";
import { cardVariants } from "../../motion/variants";
import { Button } from "../../ui/Button";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { EmptyState, ErrorState } from "../../ui/states";
import { Steps } from "../../ui/Steps";
import { Surface } from "../../ui/Surface";
import { CampaignCards, CampaignSkeletons } from "./CampaignCards";
import { CampaignHistory } from "./CampaignHistory";
import { GreetingsSwitch } from "./GreetingsSwitch";
import { KEEP_LINE, SPAN, hebrewYearLabel, stageSteps } from "./greetings-model";
import { useScrollToHash } from "./hooks";
import { LastCampaignCard } from "./LastCampaignCard";

/** Holiday greetings: the current campaign, its message, sending and history. */
export function HolidaysScreen() {
  const phone = useShell() === "phone";
  const { greetingsCopy, holidayNames, screens } = useCopy();
  const { locale } = useLocale();
  const copy = greetingsCopy.holidays;
  const current = useCurrentCampaign();
  const audiences = useAudiences();
  const history = useCampaignHistory();
  // #history and #send land once everything above them has its final height.
  useScrollToHash(!current.isPending && !audiences.isPending && !history.isPending);

  const campaign = current.data;
  const soft = campaign
    ? copy.campaignName(holidayNames[campaign.holiday], hebrewYearLabel(campaign.hebrewYear, locale))
    : campaign === null
      ? screens.holidays.soft
      : KEEP_LINE;

  return (
    <ScreenFrame>
      {phone ? <PhoneTopBar /> : null}
      {phone ? (
        <GreetingsSwitch current="holidays" />
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <Headline title={copy.title} soft={soft} size="display" />
          <motion.div variants={cardVariants} className="flex flex-col items-end gap-3 pb-1.5">
            {campaign ? (
              // A block around the pill, so the pill sits at the end like the board's.
              <div>
                <Steps steps={stageSteps(campaign, copy.stages)} label={copy.stagesLabel} pill />
              </div>
            ) : null}
            {/* Starting a new greeting is not a service yet. */}
            <Button variant="outline" size="sm" icon="plus" disabled>
              {copy.newGreeting}
            </Button>
          </motion.div>
        </div>
      )}

      <div className="grid gap-3.5 lg:grid-cols-12 lg:gap-5">
        {current.isPending ? <CampaignSkeletons phone={phone} /> : null}
        {current.isError && campaign === undefined ? (
          <Surface variant="card" compact={phone} aria-label={copy.next.label} className={SPAN.full}>
            <ErrorState onRetry={() => void current.refetch()} />
          </Surface>
        ) : null}
        {campaign === null ? (
          <Surface variant="glass" compact={phone} aria-label={copy.next.label} className={SPAN.full}>
            <EmptyState message={copy.noCampaign} />
          </Surface>
        ) : null}
        {campaign ? <CampaignCards key={campaign.id} campaign={campaign} phone={phone} /> : null}
        <LastCampaignCard phone={phone} className={SPAN.lastCampaign} />
        <CampaignHistory phone={phone} className={SPAN.full} />
      </div>
    </ScreenFrame>
  );
}
