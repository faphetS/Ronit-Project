import { useRef, useState } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { MESSAGE_TOKENS } from "../../data/messages";
import { useBirthdays, useBirthdaySettings, useUpdateBirthdaySettings, useWhatsAppStatus } from "../../data/queries";
import type { BirthdaySettings } from "../../data/types";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber } from "../../lib/format";
import { Button } from "../../ui/Button";
import { ChatPreview } from "../../ui/ChatPreview";
import { SectionHeader } from "../../ui/SectionHeader";
import { ErrorState, LoadingBlock } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { TextArea } from "../../ui/TextArea";
import { useToast } from "../../ui/toast-context";
import { SPAN, errorCode, fullName } from "./greetings-model";
import { useTextDirection } from "./hooks";

/** The birthday template (#template) and, on desktop, its WhatsApp preview beside it. */
export function TemplateCards({ phone }: { phone: boolean }) {
  const { greetingsCopy } = useCopy();
  const copy = greetingsCopy.birthdays;
  const settings = useBirthdaySettings();
  const data = settings.data;
  if (data) return <TemplateEditor settings={data} phone={phone} />;
  return (
    <>
      <Surface
        variant="card"
        compact={phone}
        id="template"
        tabIndex={-1}
        aria-label={copy.template.title}
        className={cx("scroll-mt-3", !phone && SPAN.template)}
      >
        {settings.isPending ? <LoadingBlock lines={5} /> : <ErrorState onRetry={() => void settings.refetch()} />}
      </Surface>
      {phone ? null : (
        <Surface variant="glass" aria-label={copy.preview.title} className={SPAN.birthdayPreview}>
          {settings.isPending ? <LoadingBlock lines={4} /> : null}
        </Surface>
      )}
    </>
  );
}

function TemplateEditor({ settings, phone }: { settings: BirthdaySettings; phone: boolean }) {
  const { greetingsCopy } = useCopy();
  const { locale } = useLocale();
  const copy = greetingsCopy.birthdays;
  const overview = useBirthdays();
  const update = useUpdateBirthdaySettings();
  const whatsapp = useWhatsAppStatus();
  const toast = useToast();
  const [draft, setDraft] = useState(settings.template);
  const fieldRef = useRef<HTMLDivElement>(null);
  useTextDirection(fieldRef, locale);
  const dirty = draft !== settings.template;

  // The preview shows the first birthday of today, else the next one, else the last one sent.
  const people = overview.data;
  const person = people ? (people.today[0] ?? people.upcoming[0] ?? people.recent[0]) : undefined;
  const values: Record<string, string> = person
    ? { [MESSAGE_TOKENS.firstName]: person.firstName, [MESSAGE_TOKENS.age]: formatNumber(person.age) }
    : {};

  const save = () => {
    if (!dirty) {
      toast.show({ message: copy.template.unchanged });
      return;
    }
    update.mutate(
      { template: draft },
      {
        onSuccess: (saved) =>
          toast.show({ message: saved.templateReview?.status === "PENDING" && saved.template === draft.trim() ? copy.template.review.submitted : copy.template.saved }),
        onError: (error) => {
          const code = errorCode(error);
          const message =
            code === "empty-template" || code === "validation-error" ? copy.template.empty : (code && greetingsCopy.holidays.review.problems[code]) || copy.template.failed;
          toast.show({ message, tone: "warning" });
        },
      },
    );
  };

  // What WhatsApp said about the text: the approved one goes out until a newer one is approved.
  const review = settings.templateReview;
  const reviewLine =
    review?.status === "REJECTED"
      ? { text: copy.template.review.rejected(review.reason || null), warning: true }
      : review
        ? { text: settings.approvedTemplate ? copy.template.review.pending : copy.template.review.pendingFirst, warning: false }
        : settings.approvedTemplate !== null && settings.approvedTemplate === settings.template
          ? { text: copy.template.review.approved, warning: false }
          : whatsapp.data && !whatsapp.data.connected && settings.template
            ? { text: copy.template.review.notConnected, warning: false }
            : null;
  const reviewNote = reviewLine ? (
    <p className={cx("text-caption", reviewLine.warning ? "text-status-warning" : "text-mute")}>{reviewLine.text}</p>
  ) : null;

  const tokens = [
    { label: copy.template.tokens.firstName, token: MESSAGE_TOKENS.firstName },
    { label: copy.template.tokens.age, token: MESSAGE_TOKENS.age },
  ];

  return (
    <>
      <Surface
        variant="card"
        compact={phone}
        id="template"
        tabIndex={-1}
        aria-label={copy.template.title}
        className={cx("flex scroll-mt-3 flex-col", phone ? "gap-2.5" : cx("gap-3", SPAN.template))}
      >
        <SectionHeader title={copy.template.title} trailing={copy.template.updated(formatDayMonth(new Date(settings.templateUpdatedAt), locale))} flush />
        <div ref={fieldRef}>
          <TextArea
            label={copy.template.label}
            showLabel={!phone}
            name="birthday-template"
            value={draft}
            onChange={setDraft}
            rows={phone ? 5 : 6}
            onPaper
            tokens={phone ? undefined : tokens}
            actions={
              phone ? undefined : (
                <Button size="sm" onClick={save} disabled={update.isPending}>
                  {copy.template.save}
                </Button>
              )
            }
          />
        </div>
        {reviewNote}
        {phone ? (
          <Button onClick={save} disabled={update.isPending}>
            {copy.template.save}
          </Button>
        ) : null}
      </Surface>
      {phone ? null : (
        <Surface variant="glass" aria-label={copy.preview.title} className={cx("flex flex-col gap-3", SPAN.birthdayPreview)}>
          <SectionHeader title={copy.preview.title} trailing={person ? fullName(person) : undefined} surface="glass" flush />
          {/* The greeting is Hebrew, so the chat reads right to left in English too, as the customer sees it. */}
          <div dir="rtl" className="flex flex-1 flex-col">
            <ChatPreview text={draft} values={values} time={settings.sendTime} className="flex-1" />
          </div>
        </Surface>
      )}
    </>
  );
}
