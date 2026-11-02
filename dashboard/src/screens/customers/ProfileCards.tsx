import { useId, useState, type FormEvent } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useAddCustomerNote, useCustomerMessages, usePassportAccessLog } from "../../data/queries";
import type { Customer, CustomerMessage, DeliveryStatus, PassportAccessEntry } from "../../data/types";
import { now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDate, formatTime, maskPhone } from "../../lib/format";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { KeyValue, type KeyValueItem } from "../../ui/KeyValue";
import { ListRow } from "../../ui/ListRow";
import { Ltr } from "../../ui/Ltr";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState } from "../../ui/states";
import { StatusTag, type StatusTone } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextArea } from "../../ui/TextArea";
import { TextLink } from "../../ui/TextLink";
import { Timeline } from "../../ui/Timeline";
import { useToast } from "../../ui/toast-context";
import { RowsSkeleton } from "./Skeletons";
import { useStaffLookup } from "./useStaffLookup";
import { momentLabel } from "./when";

/** The black card: who saw the passport or changed it, newest first. */
export function AccessLogCard({ customerId, className }: { customerId: string; className?: string }) {
  const { customersCopy: copy } = useCopy();
  const { locale } = useLocale();
  const headingId = useId();
  const log = usePassportAccessLog(customerId);
  const staff = useStaffLookup();
  const reference = now();

  const title = (entry: PassportAccessEntry): string => {
    const name = staff(entry.byUserId)?.name ?? null;
    switch (entry.action) {
      case "passport-view":
        return copy.accessLog.view(name);
      case "passport-photo-view":
        return copy.accessLog.photoView(name);
      case "passport-received": {
        const action = copy.accessLog.received[entry.via];
        return name ? copy.accessLog.by(action, name) : action;
      }
    }
  };

  return (
    <Surface variant="ink" aria-labelledby={headingId} className={cx("flex flex-col gap-4", className)}>
      <SectionHeader id={headingId} surface="ink" flush title={copy.accessLog.title} trailing={<Icon name="shield" className="text-gold" />} />
      {log.isPending ? <RowsSkeleton onDark avatar={false} /> : null}
      {log.isError && !log.data ? <ErrorState onDark onRetry={() => void log.refetch()} /> : null}
      {log.data && log.data.length === 0 ? <EmptyState onDark message={copy.accessLog.empty} /> : null}
      {log.data && log.data.length > 0 ? (
        <Timeline
          surface="ink"
          entries={log.data.map((entry) => ({ key: entry.id, title: title(entry), meta: momentLabel(new Date(entry.at), reference, locale, copy.when) }))}
        />
      ) : null}
      <p className="mt-auto text-caption text-ink-mute">{copy.accessLog.footer}</p>
    </Surface>
  );
}

const STATUS_TONE: Record<DeliveryStatus, StatusTone> = {
  "awaiting-approval": "new",
  scheduled: "sent",
  paused: "irrelevant",
  sent: "sent",
  delivered: "sent",
  read: "registered",
  failed: "warning",
};

/** How many messages the phone shows before "כל ההודעות". */
const PHONE_LIMIT = 3;

/** The greetings that went to the customer, and the one waiting, newest first. */
export function MessagesCard({ customerId, compact = false, className }: { customerId: string; compact?: boolean; className?: string }) {
  const { customersCopy: copy, holidayNames } = useCopy();
  const { locale } = useLocale();
  const headingId = useId();
  const messages = useCustomerMessages(customerId);
  const [expanded, setExpanded] = useState(false);
  const all = messages.data ?? [];
  const shown = compact && !expanded ? all.slice(0, PHONE_LIMIT) : all;

  const name = (message: CustomerMessage) =>
    message.kind === "holiday" && message.holiday ? copy.messages.holiday(holidayNames[message.holiday]) : copy.messages.birthday;

  const describe = (message: CustomerMessage) => {
    const at = new Date(message.at);
    if (message.status === "awaiting-approval" || message.status === "scheduled") {
      return message.kind === "holiday" ? copy.messages.dueOnEve : copy.messages.dueAt(formatDate(at, locale), formatTime(at));
    }
    if (message.status === "paused") return copy.messages.paused;
    // The phone board shows the date alone.
    const when = compact ? formatDate(at, locale) : copy.messages.at(formatDate(at, locale), formatTime(at));
    return message.failure ? copy.messages.withFailure(when, copy.messages.failure[message.failure]) : when;
  };

  return (
    <Surface variant="glass" compact={compact} aria-labelledby={headingId} className={cx(compact && "px-[18px] pt-4 pb-1.5", className)}>
      <SectionHeader
        id={headingId}
        title={copy.messages.title}
        flush={compact}
        className={compact ? "mb-1" : undefined}
        trailing={compact ? undefined : <TextLink to="/greetings/holidays#history">{copy.messages.allHistory}</TextLink>}
      />
      {messages.isPending ? <RowsSkeleton avatar={false} /> : null}
      {messages.isError && !messages.data ? <ErrorState onRetry={() => void messages.refetch()} /> : null}
      {messages.data && all.length === 0 ? <EmptyState message={copy.messages.empty} /> : null}
      {shown.length > 0 ? (
        <ul>
          {shown.map((message) => (
            <ListRow
              key={message.id}
              as="li"
              surface="glass"
              title={name(message)}
              description={describe(message)}
              trailing={<StatusTag tone={STATUS_TONE[message.status]}>{(compact ? copy.messages.statusShort : copy.messages.status)[message.status]}</StatusTag>}
            />
          ))}
        </ul>
      ) : null}
      {compact && all.length > PHONE_LIMIT ? (
        <div className="pt-1 pb-3">
          <TextLink onClick={() => setExpanded((open) => !open)}>{expanded ? copy.messages.fewer : copy.messages.more(all.length)}</TextLink>
        </div>
      ) : null}
    </Surface>
  );
}

/** Desktop: group, source, who it is assigned to, the lead and Monday board it came from, and the phone. */
export function DetailsCard({ customer, groupLabel, className }: { customer: Customer; groupLabel: string; className?: string }) {
  const { customersCopy: copy } = useCopy();
  const headingId = useId();
  const staff = useStaffLookup();
  const rows = copy.details.rows;
  const assignee = customer.assigneeId ? (staff(customer.assigneeId)?.name ?? copy.list.pending) : copy.details.unassigned;
  const fromMonday = customer.mondayBoard ? copy.details.fromMonday(customer.mondayBoard) : null;
  const lead = customer.leadId ? <TextLink to={`/leads/${customer.leadId}`}>{fromMonday ?? copy.details.openLead}</TextLink> : (fromMonday ?? copy.details.noLead);
  const items: KeyValueItem[] = [
    { key: "group", label: rows.group, value: groupLabel || "·" },
    { key: "source", label: rows.source, value: copy.details.sources[customer.source] },
    { key: "assignee", label: rows.assignee, value: assignee },
    { key: "lead", label: rows.lead, value: lead },
    { key: "phone", label: rows.phone, value: <Ltr>{maskPhone(customer.phone)}</Ltr> },
  ];
  return (
    <Surface variant="card" aria-labelledby={headingId} className={className}>
      <SectionHeader id={headingId} title={copy.details.title} />
      <KeyValue items={items} />
    </Surface>
  );
}

/** Internal notes, newest first, and a field for a new one. The note shows at once and rolls back if saving fails. */
export function NotesCard({ customer, compact = false, className }: { customer: Customer; compact?: boolean; className?: string }) {
  const { customersCopy: copy } = useCopy();
  const { locale } = useLocale();
  const headingId = useId();
  const toast = useToast();
  const addNote = useAddCustomerNote();
  const staff = useStaffLookup();
  const [text, setText] = useState("");
  const reference = now();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = text.trim();
    if (!note || addNote.isPending) return;
    setText("");
    addNote.mutate(
      { id: customer.id, text: note },
      {
        onSuccess: () => toast.show({ message: copy.notes.saved }),
        onError: () => {
          // Give the text back, unless something new was typed meanwhile.
          setText((current) => current || note);
          toast.show({ message: copy.notes.failed, tone: "warning" });
        },
      },
    );
  };

  return (
    <Surface variant="card" compact={compact} aria-labelledby={headingId} className={cx("flex flex-col gap-3", compact && "pt-4", className)}>
      <SectionHeader id={headingId} title={copy.notes.title} flush />
      {customer.notes.length === 0 ? (
        <EmptyState message={copy.notes.empty} />
      ) : (
        <ul>
          {customer.notes.map((note) => {
            const author = staff(note.byUserId);
            const when = momentLabel(new Date(note.at), reference, locale, copy.when);
            return (
              <ListRow
                key={note.id}
                as="li"
                align="start"
                leading={<Avatar initial={author?.initial ?? ""} />}
                title={note.text}
                description={author ? copy.notes.meta(author.name, when) : when}
              />
            );
          })}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextArea label={copy.notes.newNote} name="note" placeholder={copy.notes.newNote} value={text} onChange={setText} rows={2} onPaper />
        <Button type="submit" size="sm" disabled={!text.trim() || addNote.isPending} className="self-start">
          {copy.notes.save}
        </Button>
      </form>
    </Surface>
  );
}
