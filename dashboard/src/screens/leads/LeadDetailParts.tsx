import { useId } from "react";
import { motion } from "motion/react";
import { useCopy, useLocale } from "../../content/locale";
import type { Lead } from "../../data/types";
import { dayAt } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDate, formatDayMonth, maskPhone } from "../../lib/format";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { KeyValue, type KeyValueItem } from "../../ui/KeyValue";
import { Ltr } from "../../ui/Ltr";
import { Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import type { SurfaceVariant } from "../../ui/Surface";
import { Timeline, type TimelineEntry } from "../../ui/Timeline";
import { initialOf, STATUS_TONE, telHref, whatsappHref } from "./leads-model";

const HEADING = { 1: "h1", 2: "h2", 3: "h3" } as const;

/** The small muted heading over a part of the detail ("ב-Monday", "הערות ושיחות"), like the board's labels. */
const PART_HEADING = "mb-2 text-[13px] font-medium text-mute";

interface LeadHeaderProps {
  lead: Lead;
  /** h2 in the desktop panel, h1 on the phone screen. */
  level: 1 | 2;
  /** Phones: the status goes under the service, so long names keep their width. */
  stacked?: boolean;
}

/** Avatar, name, what she asked about and the Monday group, and the status. */
export function LeadHeader({ lead, level, stacked = false }: LeadHeaderProps) {
  const { leadsCopy: copy } = useCopy();
  const Heading = HEADING[level];
  const service = lead.service ? copy.services[lead.service] : copy.noService;
  const status = <StatusTag tone={STATUS_TONE[lead.status]}>{copy.status[lead.status]}</StatusTag>;
  return (
    <div className="flex items-center gap-3.5">
      <Avatar initial={initialOf(lead.name)} tone="glass" size="lg" />
      <div className="min-w-0 flex-1">
        <Heading className="text-display-3 font-light break-words text-ink">{lead.name}</Heading>
        <p className="mt-1 text-small text-mute">
          {service}
          {copy.separator}
          <bdi>{lead.mondayGroup}</bdi>
          {lead.archived ? `${copy.separator}${copy.archived}` : null}
        </p>
        {stacked ? <div className="mt-2.5">{status}</div> : null}
      </div>
      {stacked ? null : status}
    </div>
  );
}

interface ContactLinkProps {
  href: string;
  icon: IconName;
  label: string;
  solid?: boolean;
  /** Opens in a new tab: the name says so. */
  newTabLabel?: string;
}

/** A pill link in the family of Button, which cannot point outside the app. 44px tall on phones. */
function ContactLink({ href, icon, label, solid = false, newTabLabel }: ContactLinkProps) {
  return (
    <motion.a
      href={href}
      target={newTabLabel ? "_blank" : undefined}
      rel={newTabLabel ? "noopener noreferrer" : undefined}
      aria-label={newTabLabel}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className={cx(
        "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[14px] leading-none font-medium whitespace-nowrap transition-colors lg:h-[38px]",
        solid ? "bg-ink text-cream hover:bg-black" : "text-ink ring-1 ring-ink/28 ring-inset hover:bg-white/65",
      )}
    >
      <Icon name={icon} size={16} />
      {label}
    </motion.a>
  );
}

/** WhatsApp and a phone call, side by side. */
export function LeadContactLinks({ phone }: { phone: string }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <div className="flex gap-2">
      <ContactLink href={whatsappHref(phone)} icon="chat" label={copy.detail.whatsapp} newTabLabel={copy.detail.newTab(copy.detail.whatsapp)} solid />
      <ContactLink href={telHref(phone)} icon="phone" label={copy.detail.call} />
    </div>
  );
}

/** Phone, source, service, the Monday group, the first contact and the calls. */
export function LeadFacts({ lead, surface }: { lead: Lead; surface: SurfaceVariant }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const inquiry = lead.inquiryOn ? dayAt(lead.inquiryOn) : new Date(lead.createdAt);
  const lastCall = lead.lastCallOn ? formatDayMonth(dayAt(lead.lastCallOn), locale) : null;
  const items: KeyValueItem[] = [
    { key: "phone", label: copy.detail.phone, value: <Ltr>{maskPhone(lead.phone)}</Ltr> },
    { key: "source", label: copy.detail.source, value: copy.sources[lead.source] },
    { key: "service", label: copy.detail.service, value: lead.service ? copy.services[lead.service] : copy.noService },
    { key: "group", label: copy.detail.mondayGroup, value: <bdi>{lead.mondayGroup}</bdi> },
    { key: "inquiry", label: copy.detail.inquiry, value: formatDate(inquiry, locale) },
    { key: "calls", label: copy.detail.calls, value: copy.detail.callsLine(lead.calls, lastCall) },
  ];
  return <KeyValue items={items} surface={surface} />;
}

interface LeadInMondayProps {
  lead: Lead;
  level: 2 | 3;
}

/**
 * Where the lead is worked until the switch-over: what Monday says comes next, her last Instagram
 * message, and the way to her row in Monday, where the status and notes change.
 */
export function LeadInMonday({ lead, level }: LeadInMondayProps) {
  const { leadsCopy: copy } = useCopy();
  const headingId = useId();
  const Heading = HEADING[level];
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <Heading id={headingId} className={cx(PART_HEADING, "mb-0")}>
        {copy.detail.inMonday}
      </Heading>
      {lead.nextStep ? <MondayText label={copy.detail.nextStep} text={lead.nextStep} /> : null}
      {lead.lastMessage ? <MondayText label={copy.detail.lastMessage} text={lead.lastMessage} /> : null}
      <p className="text-small text-mute">{copy.detail.editInMonday}</p>
      <div className="flex">
        <ContactLink href={lead.mondayUrl} icon="forward" label={copy.detail.openInMonday} newTabLabel={copy.detail.newTab(copy.detail.openInMonday)} />
      </div>
    </section>
  );
}

function MondayText({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-caption text-mute">{label}</p>
      <p className="mt-0.5 text-small break-words whitespace-pre-line text-copy">
        <bdi>{text}</bdi>
      </p>
    </div>
  );
}

interface LeadHistoryProps {
  lead: Lead;
  level: 2 | 3;
  surface: SurfaceVariant;
}

/** Monday's notes and call summaries, newest first, with the day and who wrote them. */
export function LeadHistory({ lead, level, surface }: LeadHistoryProps) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const headingId = useId();
  const Heading = HEADING[level];

  const entries: TimelineEntry[] = lead.history.map((event) => {
    const date = formatDayMonth(new Date(event.at), locale);
    return { key: event.id, title: event.text, meta: event.author ? copy.detail.historyMeta(date, event.author) : date };
  });

  return (
    <section aria-labelledby={headingId}>
      <Heading id={headingId} className={PART_HEADING}>
        {copy.detail.history}
      </Heading>
      {entries.length > 0 ? <Timeline entries={entries} surface={surface} /> : <p className="text-small text-mute">{copy.detail.noHistory}</p>}
    </section>
  );
}

/** The header while the lead loads. */
export function LeadHeaderSkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3.5">
      <span className="size-[76px] shrink-0 overflow-hidden rounded-full">
        <Skeleton className="size-full" />
      </span>
      <span className="flex flex-1 flex-col gap-2.5">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-3.5 w-1/3" />
      </span>
    </div>
  );
}

/** The rest of the detail while it loads: contact buttons, details, the Monday part and the notes. */
export function LeadBodySkeleton() {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-[18px]">
      <span className="sr-only">{states.loading}</span>
      <div aria-hidden="true" className="flex gap-2">
        <Skeleton className="h-[38px] flex-1" />
        <Skeleton className="h-[38px] flex-1" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-[22px] py-2">
        {["w-24", "w-16", "w-12", "w-20"].map((width) => (
          <div key={width} className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className={cx("h-3.5", width)} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        {["w-16", "w-20", "w-28", "w-32"].map((width) => (
          <Skeleton key={width} className={cx("h-10", width)} />
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}
