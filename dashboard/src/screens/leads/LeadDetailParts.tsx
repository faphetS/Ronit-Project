import { motion } from "motion/react";
import { useId, useState, type FormEvent } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useAddLeadNote, useGroups, useUpdateLeadStatus } from "../../data/queries";
import type { Lead, LeadStatus } from "../../data/types";
import { cx } from "../../lib/cx";
import { formatDate, formatDayMonth, maskPhone } from "../../lib/format";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { KeyValue, type KeyValueItem } from "../../ui/KeyValue";
import { Ltr } from "../../ui/Ltr";
import { Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import type { SurfaceVariant } from "../../ui/Surface";
import { TextArea } from "../../ui/TextArea";
import { TextLink } from "../../ui/TextLink";
import { Timeline, type TimelineEntry } from "../../ui/Timeline";
import { useToast } from "../../ui/toast-context";
import { useStaff } from "./leads-data";
import { initialOf, STATUS_ORDER, STATUS_TONE, telHref, whatsappHref } from "./leads-model";

const HEADING = { 1: "h1", 2: "h2", 3: "h3" } as const;

/** The small muted heading over a part of the detail ("סטטוס", "היסטוריה"), like the board's labels. */
const PART_HEADING = "mb-2 text-[13px] font-medium text-mute";

interface LeadHeaderProps {
  lead: Lead;
  /** h2 in the desktop panel, h1 on the phone screen. */
  level: 1 | 2;
  /** Phones: the status goes under the trip, so long names keep their width. */
  stacked?: boolean;
}

/** Avatar, name, trip and status. */
export function LeadHeader({ lead, level, stacked = false }: LeadHeaderProps) {
  const { leadsCopy: copy } = useCopy();
  const groups = useGroups();
  const Heading = HEADING[level];
  const trip = lead.groupId ? groups.data?.find((group) => group.id === lead.groupId)?.name : copy.noGroup;
  const status = <StatusTag tone={STATUS_TONE[lead.status]}>{copy.status[lead.status]}</StatusTag>;
  return (
    <div className="flex items-center gap-3.5">
      <Avatar initial={initialOf(lead.name)} tone="glass" size="lg" />
      <div className="min-w-0 flex-1">
        <Heading className="text-display-3 font-light break-words text-ink">{lead.name}</Heading>
        {trip ? <p className="mt-1 text-small text-mute">{trip}</p> : groups.isPending ? <Skeleton className="mt-2 h-3.5 w-28" /> : null}
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

/** Phone, source, assignee and the day the lead came in. */
export function LeadFacts({ lead, surface }: { lead: Lead; surface: SurfaceVariant }) {
  const { leadsCopy: copy, states } = useCopy();
  const { locale } = useLocale();
  const staff = useStaff();

  let assignee;
  if (lead.assigneeId === null) assignee = copy.detail.unassigned;
  else if (staff.names.has(lead.assigneeId)) assignee = staff.names.get(lead.assigneeId);
  else if (staff.isError)
    assignee = (
      <TextLink size="xs" onClick={() => void staff.refetch()}>
        {states.retry}
      </TextLink>
    );
  else if (staff.isPending)
    assignee = (
      <span className="inline-flex align-middle">
        <Skeleton className="h-4 w-14" />
      </span>
    );
  else assignee = copy.pending;

  const items: KeyValueItem[] = [
    { key: "phone", label: copy.detail.phone, value: <Ltr>{maskPhone(lead.phone)}</Ltr> },
    { key: "source", label: copy.detail.source, value: copy.sources[lead.source] },
    { key: "assignee", label: copy.detail.assignee, value: assignee },
    { key: "created", label: copy.detail.created, value: formatDate(new Date(lead.createdAt), locale) },
  ];
  return <KeyValue items={items} surface={surface} />;
}

interface LeadStatusPickerProps {
  lead: Lead;
  level: 2 | 3;
  /** On a white card. */
  onPaper?: boolean;
}

/** The status chips. A change shows at once, is confirmed by a toast with undo, and rolls back if it fails. */
export function LeadStatusPicker({ lead, level, onPaper = false }: LeadStatusPickerProps) {
  const { leadsCopy: copy } = useCopy();
  const toast = useToast();
  const update = useUpdateLeadStatus();
  const headingId = useId();
  const Heading = HEADING[level];

  const setStatus = (status: LeadStatus, previous?: LeadStatus): void => {
    update.mutate(
      { id: lead.id, status },
      {
        onSuccess: () => toast.show({ message: copy.statusChanged(copy.status[status]), onUndo: previous ? () => setStatus(previous) : undefined }),
        onError: () => toast.show({ message: copy.detail.statusFailed, tone: "warning" }),
      },
    );
  };

  return (
    <section aria-labelledby={headingId}>
      <Heading id={headingId} className={PART_HEADING}>
        {copy.detail.status}
      </Heading>
      <ChipGroup
        id="lead-status-change"
        label={copy.detail.changeStatus}
        options={STATUS_ORDER.map((status) => ({ value: status, label: copy.status[status] }))}
        value={lead.status}
        onChange={(status) => {
          if (status !== lead.status) setStatus(status, lead.status);
        }}
        onPaper={onPaper}
      />
    </section>
  );
}

interface LeadHistoryProps {
  lead: Lead;
  level: 2 | 3;
  surface: SurfaceVariant;
}

/** Notes and changes, newest first. What came over from Monday is a soft entry under its board's name. */
export function LeadHistory({ lead, level, surface }: LeadHistoryProps) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const staff = useStaff();
  const headingId = useId();
  const Heading = HEADING[level];

  const entries: TimelineEntry[] = lead.history.map((event) => {
    if (event.mondayBoard) return { key: event.id, title: event.text, meta: copy.detail.mondayBoard(event.mondayBoard), soft: true };
    const date = formatDayMonth(new Date(event.at), locale);
    const by = event.byUserId ? staff.names.get(event.byUserId) : undefined;
    return { key: event.id, title: event.text, meta: by ? copy.detail.historyMeta(date, by) : date };
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

/** A new note: it tops the history at once; the field empties, and gets the text back if saving fails. */
export function LeadNoteForm({ leadId, onPaper = false }: { leadId: string; onPaper?: boolean }) {
  const { leadsCopy: copy } = useCopy();
  const toast = useToast();
  const addNote = useAddLeadNote();
  const [text, setText] = useState("");
  const [needsText, setNeedsText] = useState(false);
  const hintId = useId();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = text.trim();
    if (!note) {
      setNeedsText(true);
      const field = event.currentTarget.elements.namedItem("note");
      if (field instanceof HTMLTextAreaElement) field.focus();
      return;
    }
    setNeedsText(false);
    setText("");
    addNote.mutate(
      { id: leadId, text: note },
      {
        onSuccess: () => toast.show({ message: copy.detail.noteSaved }),
        onError: () => {
          setText((current) => current || note);
          toast.show({ message: copy.detail.noteFailed, tone: "warning" });
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2.5">
      <TextArea
        label={copy.detail.note}
        showLabel
        name="note"
        rows={3}
        value={text}
        onChange={(value) => {
          setText(value);
          if (needsText && value.trim()) setNeedsText(false);
        }}
        placeholder={copy.detail.notePlaceholder}
        onPaper={onPaper}
        describedBy={hintId}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={addNote.isPending}>
          {copy.detail.save}
        </Button>
        <p id={hintId} role="status" className="text-caption text-mute">
          {needsText ? copy.detail.noteEmpty : ""}
        </p>
      </div>
    </form>
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

/** The rest of the detail while it loads: contact buttons, details, status chips and history. */
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
