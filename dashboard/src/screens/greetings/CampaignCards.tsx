import { motion } from "motion/react";
import { useRef, useState } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { MESSAGE_TOKENS } from "../../data/messages";
import { useApproveCampaign, useAudiences, useSendCampaignTest, useUpdateCampaign } from "../../data/queries";
import { CAMPAIGN_STAGES, type HolidayCampaign } from "../../data/types";
import { dayAt, daysBetween, now, today } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber, formatRelative, formatTime } from "../../lib/format";
import { cardVariants } from "../../motion/variants";
import { BigNumber } from "../../ui/BigNumber";
import { Button } from "../../ui/Button";
import { ChatPreview } from "../../ui/ChatPreview";
import { ChipGroup } from "../../ui/ChipGroup";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { GooButton } from "../../ui/GooButton";
import { KeyValue, type KeyValueItem } from "../../ui/KeyValue";
import { OrbCard } from "../../ui/OrbCard";
import { SectionHeader } from "../../ui/SectionHeader";
import { StageBar } from "../../ui/StageBar";
import { ErrorState, LoadingBlock, Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextArea } from "../../ui/TextArea";
import { useToast } from "../../ui/toast-context";
import { FitHeadline } from "./FitHeadline";
import {
  CAMPAIGN_TONE,
  HOLIDAY_ORB,
  SPAN,
  audienceName,
  awaitsApproval,
  errorCode,
  fullName,
  hebrewYearLabel,
  isEditable,
  messageCount,
  stageIndex,
} from "./greetings-model";
import { useTextDirection } from "./hooks";

type Confirming = "approve" | "test" | null;

interface CampaignCardsProps {
  campaign: HolidayCampaign;
  phone: boolean;
}

/**
 * The greeting being prepared: the orb card, the text with its WhatsApp preview, and sending.
 * Phones add the stage bar under the orb card. The preview follows the text as it is typed.
 */
export function CampaignCards({ campaign, phone }: CampaignCardsProps) {
  const { greetingsCopy, holidayNames } = useCopy();
  const { locale } = useLocale();
  const copy = greetingsCopy.holidays;
  const toast = useToast();
  const audiences = useAudiences();
  const update = useUpdateCampaign();
  const approve = useApproveCampaign();
  const sendTest = useSendCampaignTest();
  const [draft, setDraft] = useState(campaign.message);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  useTextDirection(fieldRef, locale);

  const holiday = holidayNames[campaign.holiday];
  const eve = dayAt(campaign.eve);
  const eveDate = formatDayMonth(eve, locale);
  const time = formatTime(new Date(campaign.sendAt));
  const countdown = copy.next.countdown(daysBetween(today(), eve));
  const recipients = formatNumber(campaign.recipients);
  const audienceOptions = audiences.data ?? [];
  const audienceLabel = audienceName(
    audienceOptions.find((option) => option.id === campaign.audienceId),
    copy.audienceAll,
  );
  const rate = copy.send.rateValue(formatNumber(campaign.rate.messages), formatNumber(campaign.rate.everyMinutes));
  const dirty = draft !== campaign.message;
  const editable = isEditable(campaign);
  const awaiting = awaitsApproval(campaign);
  const preview = campaign.preview;
  const previewValues: Record<string, string> = preview
    ? { [MESSAGE_TOKENS.firstName]: preview.firstName, ...(preview.groupName ? { [MESSAGE_TOKENS.groupName]: preview.groupName } : {}) }
    : {};

  const editError = (error: unknown, fallback: string) => {
    const code = errorCode(error);
    if (code === "empty-message") return copy.editor.empty;
    if (code === "campaign-sent") return copy.editor.alreadySent;
    return fallback;
  };

  const save = () => {
    if (!dirty) {
      toast.show({ message: copy.editor.unchanged });
      return;
    }
    // A change after approval sends the greeting back for approval.
    const backToApproval = campaign.status === "scheduled";
    update.mutate(
      { id: campaign.id, patch: { message: draft } },
      {
        onSuccess: () => toast.show({ message: backToApproval ? copy.editor.savedBackToApproval : copy.editor.savedToast }),
        onError: (error) => toast.show({ message: editError(error, copy.editor.failed), tone: "warning" }),
      },
    );
  };

  const changeAudience = (audienceId: string) => {
    if (audienceId === campaign.audienceId) return;
    if (!editable) {
      toast.show({ message: copy.editor.alreadySent, tone: "warning" });
      return;
    }
    const previous = campaign.audienceId;
    const label = audienceName(
      audienceOptions.find((option) => option.id === audienceId),
      copy.audienceAll,
    );
    const backToApproval = campaign.status === "scheduled";
    update.mutate(
      { id: campaign.id, patch: { audienceId } },
      {
        onSuccess: () =>
          toast.show({
            message: backToApproval ? copy.send.audienceBackToApproval(label) : copy.send.audienceSaved(label),
            onUndo: backToApproval ? undefined : () => update.mutate({ id: campaign.id, patch: { audienceId: previous } }),
          }),
        onError: () => toast.show({ message: copy.send.audienceFailed, tone: "warning" }),
      },
    );
  };

  // Unsaved changes to the text are saved first, so what Ronit approves is what she sees.
  const confirmApprove = async () => {
    try {
      if (dirty) await update.mutateAsync({ id: campaign.id, patch: { message: draft } });
      await approve.mutateAsync(campaign.id);
      toast.show({ message: copy.send.approved(holiday, eveDate, time) });
    } catch (error) {
      toast.show({ message: editError(error, copy.send.approveFailed), tone: "warning" });
    } finally {
      setConfirming(null);
    }
  };

  const confirmTest = () =>
    sendTest.mutate(campaign.id, {
      onSuccess: () => toast.show({ message: copy.send.testSent }),
      onError: () => toast.show({ message: copy.send.testFailed, tone: "warning" }),
      onSettled: () => setConfirming(null),
    });

  const tokens = [
    { label: copy.editor.tokens.firstName, token: MESSAGE_TOKENS.firstName },
    { label: copy.editor.tokens.groupName, token: MESSAGE_TOKENS.groupName },
  ];

  const schedule: KeyValueItem[] = [
    { key: "when", label: copy.send.when, value: copy.send.whenValue(time) },
    { key: "rate", label: copy.send.rate, value: rate },
    ...(phone ? [] : [{ key: "duration", label: copy.send.duration, value: copy.send.durationValue(campaign.estimatedMinutes) }]),
  ];

  const toSend = awaiting ? (phone ? copy.next.toApprovePhone : copy.next.toApprove) : phone ? copy.next.toDetailsPhone : copy.next.toDetails;

  const audienceChips = audiences.isPending ? (
    <Skeleton className="h-11 w-full max-w-[440px] lg:h-10" />
  ) : audiences.isError && !audiences.data ? (
    <ErrorState onRetry={() => void audiences.refetch()} />
  ) : (
    <ChipGroup
      id="greeting-audience"
      label={copy.send.audienceLabel}
      onPaper
      value={campaign.audienceId}
      onChange={changeAudience}
      options={audienceOptions.map((option) => ({ value: option.id, label: audienceName(option, copy.audienceAll, phone) }))}
    />
  );

  const approveControl = awaiting ? (
    <GooButton onClick={() => setConfirming("approve")}>{copy.send.approve}</GooButton>
  ) : (
    <p className="text-small text-mute">{copy.send.approvedNote(eveDate, time)}</p>
  );

  return (
    <>
      <OrbCard
        label={copy.next.label}
        compact={phone}
        orb={phone ? HOLIDAY_ORB.phone : HOLIDAY_ORB.desktop}
        stripBasis={phone ? "52%" : "50%"}
        className={phone ? "min-h-[250px]" : cx("min-h-[340px]", SPAN.third)}
        strip={
          phone ? (
            <>
              <FitHeadline size={40} fitKey={`${holiday}|${countdown}`}>
                {holiday}
                <br />
                <span className="text-[0.7em] text-faint">{countdown}</span>
              </FitHeadline>
              <p className="mt-2 text-caption text-mute-2">{copy.next.evePhone(eveDate, time)}</p>
              <span className="flex-1" />
              <p className="text-small font-medium text-ink">{copy.next.recipients(recipients)}</p>
              <p className="text-caption text-mute-2">{audienceLabel}</p>
            </>
          ) : (
            <>
              <FitHeadline size={60} fitKey={`${holiday}|${eveDate}`}>
                {holiday}
                <br />
                <span className="text-[0.9333em] text-faint">{eveDate}</span>
              </FitHeadline>
              <p className="mt-2.5 text-small text-mute-2">{copy.next.when(countdown, time)}</p>
              <span className="flex-1" />
              <p className="font-medium text-ink">{copy.next.recipients(recipients)}</p>
              <p className="text-small text-mute-2">{audienceLabel}</p>
            </>
          )
        }
        side={
          <>
            <p className="text-caption text-mute">
              {hebrewYearLabel(campaign.hebrewYear, locale)}
              <br />
              {copy.next.status[campaign.status]}
            </p>
            <GooButton size="sm" to="#send">
              {toSend}
            </GooButton>
          </>
        }
      />

      {phone ? (
        <motion.div variants={cardVariants} className="surface-glass rounded-inner px-[18px] py-3.5">
          <StageBar stages={CAMPAIGN_STAGES.map((stage) => copy.stagesShort[stage])} current={stageIndex(campaign)} surface="glass" />
        </motion.div>
      ) : null}

      <Surface variant="card" compact={phone} aria-label={copy.editor.title} className={cx("flex flex-col", phone ? "gap-2.5" : cx("gap-3", SPAN.third))}>
        <SectionHeader title={copy.editor.title} trailing={copy.editor.saved(formatRelative(new Date(campaign.savedAt), now(), locale))} flush />
        <div ref={fieldRef}>
          <TextArea
            label={copy.editor.label}
            showLabel={!phone}
            name="holiday-greeting"
            value={draft}
            onChange={setDraft}
            rows={6}
            onPaper
            tokens={tokens}
            disabled={!editable}
            actions={
              phone && dirty ? (
                <Button variant="outline" size="sm" onClick={save} disabled={update.isPending}>
                  {copy.editor.save}
                </Button>
              ) : undefined
            }
          />
        </div>
        {phone ? null : (
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-mute">{copy.editor.length(formatNumber(draft.length), messageCount(draft))}</p>
            <Button variant="outline" size="sm" onClick={save} disabled={!editable || update.isPending}>
              {copy.editor.save}
            </Button>
          </div>
        )}
      </Surface>

      <Surface variant="glass" compact={phone} aria-label={copy.preview.title} className={cx("flex flex-col", phone ? "gap-2.5" : cx("gap-3", SPAN.holidayPreview))}>
        <SectionHeader title={copy.preview.title} trailing={preview ? fullName(preview) : undefined} surface="glass" flush />
        {/* The greeting is Hebrew, so the chat reads right to left in English too, as the customer sees it. */}
        <div dir="rtl" className="flex flex-1 flex-col">
          <ChatPreview text={draft} values={previewValues} time={time} showSender={!phone} className="flex-1" />
        </div>
      </Surface>

      <Surface
        variant="card"
        compact={phone}
        id="send"
        tabIndex={-1}
        aria-label={copy.send.title}
        className={cx("scroll-mt-3", phone ? "flex flex-col gap-3" : SPAN.send)}
      >
        {phone ? (
          <>
            <div className="flex items-end gap-3">
              <BigNumber value={campaign.recipients} size={56} countUp />
              <p className="pb-1.5 text-small text-mute">{copy.send.recipients}</p>
            </div>
            {audienceChips}
            <KeyValue items={schedule} />
            <div className="flex flex-wrap items-center gap-2">
              {approveControl}
              <Button variant="outline" size="sm" onClick={() => setConfirming("test")}>
                {copy.send.testPhone}
              </Button>
            </div>
          </>
        ) : (
          <>
            <SectionHeader
              title={copy.send.title}
              trailing={<StatusTag tone={CAMPAIGN_TONE[campaign.status]}>{greetingsCopy.campaignStatus[campaign.status]}</StatusTag>}
            />
            <div className="flex flex-wrap items-start gap-7">
              <div className="min-w-[150px]">
                <BigNumber value={campaign.recipients} size={72} countUp />
                <p className="mt-1.5 text-small text-mute">{copy.send.recipients}</p>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                {audienceChips}
                <KeyValue items={schedule} />
              </div>
            </div>
            <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
              {approveControl}
              <Button variant="outline" onClick={() => setConfirming("test")}>
                {copy.send.test}
              </Button>
            </div>
          </>
        )}
      </Surface>

      <ConfirmDialog
        open={confirming === "approve"}
        title={copy.send.confirmTitle(holiday, recipients)}
        description={
          <>
            <p>{copy.send.confirmBody(eveDate, time, rate)}</p>
            {dirty ? <p className="mt-2">{copy.send.confirmSavesDraft}</p> : null}
          </>
        }
        confirmLabel={copy.send.approve}
        pending={update.isPending || approve.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void confirmApprove()}
      />
      <ConfirmDialog
        open={confirming === "test"}
        title={copy.send.testTitle}
        description={
          <>
            <p>{copy.send.testBody}</p>
            {dirty ? <p className="mt-2">{copy.send.testUnsaved}</p> : null}
          </>
        }
        confirmLabel={copy.send.testConfirm}
        pending={sendTest.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmTest}
      />
    </>
  );
}

/** While the greeting loads: the four cards' shapes. */
export function CampaignSkeletons({ phone }: { phone: boolean }) {
  const { greetingsCopy } = useCopy();
  const copy = greetingsCopy.holidays;
  return (
    <>
      <Surface variant="card" compact={phone} aria-label={copy.next.label} className={cx(phone ? "min-h-[250px]" : "min-h-[340px]", SPAN.third)}>
        <LoadingBlock lines={4} />
      </Surface>
      <Surface variant="card" compact={phone} aria-label={copy.editor.title} className={SPAN.third}>
        <LoadingBlock lines={5} />
      </Surface>
      <Surface variant="glass" compact={phone} aria-label={copy.preview.title} className={SPAN.holidayPreview}>
        <LoadingBlock lines={4} />
      </Surface>
      <Surface variant="card" compact={phone} aria-label={copy.send.title} className={SPAN.send}>
        <LoadingBlock lines={4} />
      </Surface>
    </>
  );
}
