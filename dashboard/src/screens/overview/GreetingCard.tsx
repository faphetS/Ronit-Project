import { useState } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useApproveCampaign, useCurrentCampaign } from "../../data/queries";
import { CAMPAIGN_STAGES, type HolidayCampaign } from "../../data/types";
import { dayAt } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber, formatTime } from "../../lib/format";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { StageBar } from "../../ui/StageBar";
import { EmptyState, ErrorState } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { useToast } from "../../ui/toast-context";
import { CAMPAIGN_TONE, oneLine } from "./overview-model";
import { GreetingSkeleton } from "./OverviewStates";

interface GreetingCardProps {
  phone: boolean;
  className?: string;
}

/** The next holiday greeting (Hanukkah in the demo): its audience, when it goes out, its stage, and approve-and-send. */
export function GreetingCard({ phone, className }: GreetingCardProps) {
  const { overview, holidayNames } = useCopy();
  const copy = overview.greeting;
  const current = useCurrentCampaign();
  const campaign = current.data;
  const label = campaign ? copy.label(holidayNames[campaign.holiday]) : copy.next;
  return (
    <Surface variant="glass" compact={phone} aria-label={label} className={cx("flex flex-col", phone ? "gap-3" : "gap-3.5", className)}>
      {current.isPending ? <GreetingSkeleton phone={phone} /> : null}
      {current.isError && campaign === undefined ? <ErrorState onRetry={() => void current.refetch()} /> : null}
      {campaign === null ? (
        <>
          <p className={cx("text-mute", phone ? "text-caption" : "text-small")}>{copy.next}</p>
          <EmptyState message={copy.none} action={<TextLink to="/greetings/holidays">{copy.toGreetings}</TextLink>} />
        </>
      ) : null}
      {campaign ? <GreetingDetails campaign={campaign} phone={phone} /> : null}
    </Surface>
  );
}

function GreetingDetails({ campaign, phone }: { campaign: HolidayCampaign; phone: boolean }) {
  const { overview, holidayNames } = useCopy();
  const copy = overview.greeting;
  const { locale } = useLocale();
  const approve = useApproveCampaign();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const holiday = holidayNames[campaign.holiday];
  const eve = formatDayMonth(dayAt(campaign.eve), locale);
  const time = formatTime(new Date(campaign.sendAt));
  const recipients = formatNumber(campaign.recipients);
  const awaiting = campaign.status === "awaiting-approval";
  const muted = cx("text-mute", phone ? "text-caption" : "text-small");

  const confirm = () =>
    approve.mutate(campaign.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.show({ message: copy.approved(holiday, eve, time) });
      },
      onError: () => {
        setConfirming(false);
        toast.show({ message: copy.approveFailed, tone: "warning" });
      },
    });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className={muted}>{phone ? copy.nextPhone(eve) : copy.next}</p>
        <StatusTag tone={CAMPAIGN_TONE[campaign.status]}>{copy.status[campaign.status]}</StatusTag>
      </div>
      {phone ? (
        <h2 className="text-display-3 font-light text-ink">
          {holiday} <span className="text-faint">· {copy.recipients(recipients)}</span>
        </h2>
      ) : (
        <>
          <h2 className="text-display-3 font-light text-ink">
            {holiday}{" "}
            <br />
            <span className="text-faint">{copy.recipients(recipients)}</span>
          </h2>
          <p className={muted}>{copy.when(eve, time)}</p>
          {/* The message is stored in Hebrew; dir="auto" keeps it right to left in English too. */}
          <p dir="auto" className="line-clamp-2 rounded-[18px] bg-white/60 px-3.5 py-3 text-small text-copy">
            {oneLine(campaign.message)}
          </p>
        </>
      )}
      <StageBar
        stages={CAMPAIGN_STAGES.map((stage) => copy.stages[stage])}
        current={CAMPAIGN_STAGES.indexOf(campaign.stage)}
        className={phone ? undefined : "mt-auto"}
      />
      <div className="flex flex-wrap gap-2">
        {awaiting ? (
          <Button size="sm" onClick={() => setConfirming(true)} className="flex-1">
            {copy.approve}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" to="/greetings/holidays" className={awaiting ? undefined : "flex-1"}>
          {phone ? copy.previewPhone : copy.preview}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={copy.confirmTitle(holiday, recipients)}
        description={copy.confirmBody(eve, time, campaign.rate.messages, campaign.rate.everyMinutes)}
        confirmLabel={copy.approve}
        pending={approve.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </>
  );
}
