import { useState } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useGroupParticipants } from "../../data/queries";
import type { Flight, FlightLeg, GroupParticipant, GroupSummary } from "../../data/types";
import { dayAt, daysBetween, today } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDate, formatDayMonth, formatNumber, formatWeekday, maskPhone } from "../../lib/format";
import { formatHebrewDate } from "../../lib/hebrew";
import { Avatar } from "../../ui/Avatar";
import { CountPill } from "../../ui/CountPill";
import { CARD_PAGE_SIZE, DataTable, type DataColumn } from "../../ui/DataTable";
import { GooButton } from "../../ui/GooButton";
import { Icon } from "../../ui/Icon";
import { KeyValue, type KeyValueItem } from "../../ui/KeyValue";
import { ListRow } from "../../ui/ListRow";
import { Ltr } from "../../ui/Ltr";
import { OrbCard } from "../../ui/OrbCard";
import { PersonCell } from "../../ui/PersonCell";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { RowsSkeleton } from "./GroupsSkeleton";
import { MISSING_SECTION, PARTICIPANTS_SECTION, fullName, groupDate, groupWhenShort, plainName, seatsFree } from "./groups";

/** Orb size and place, as on the Groups and Mobile-Groups boards. */
const ORB = {
  desktop: { orb: { size: 210, end: 72, top: 60 }, stripBasis: "55%", className: "min-h-[290px]" },
  phone: { orb: { size: 170, end: 92, top: 38 }, stripBasis: "50%", className: "min-h-[240px]" },
};

/** Phone participant lists show this many rows until "show all". */
const PREVIEW_ROWS = 6;

/** An empty cell: a muted dot, read as "none". */
function Blank() {
  const { groupsCopy: copy } = useCopy();
  return (
    <span className="text-mute">
      <span aria-hidden="true">{copy.participants.blank}</span>
      <span className="sr-only">{copy.participants.noValue}</span>
    </span>
  );
}

/** Phone and the trip note, under a name in a phone list. */
function ContactLine({ person }: { person: GroupParticipant }) {
  const { groupsCopy: copy } = useCopy();
  return (
    <>
      <Ltr>{maskPhone(person.phone)}</Ltr>
      {person.note ? `${copy.sep}${person.note}` : null}
    </>
  );
}

interface GroupProps {
  group: GroupSummary;
  className?: string;
}

/** The desktop participants table: passport status, expiry and the office's notes. Events need no passport, so they show contacts and notes. */
export function ParticipantsCard({ group, className }: GroupProps) {
  const { groupsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const participants = useGroupParticipants(group.id);
  const text = copy.participants;
  const flight = group.type === "flight";
  const name = plainName(group.shortName);
  const passportColumns: DataColumn<GroupParticipant>[] = flight
    ? [
        {
          key: "passport",
          header: text.columns.passport,
          cell: (row) => <StatusTag tone={row.passport === "received" ? "registered" : "warning"}>{text.passport[row.passport]}</StatusTag>,
        },
        {
          key: "expiry",
          header: text.columns.expiry,
          cell: (row) => (row.passportExpiry ? formatDate(dayAt(row.passportExpiry), locale) : <Blank />),
        },
      ]
    : [];
  const columns: DataColumn<GroupParticipant>[] = [
    {
      key: "name",
      header: text.columns.name,
      isRowHeader: true,
      cell: (row) => <PersonCell name={fullName(row)} initial={row.firstName.charAt(0)} to={`/customers/${row.customerId}`} />,
    },
    { key: "phone", header: text.columns.phone, cell: (row) => <Ltr>{maskPhone(row.phone)}</Ltr> },
    ...passportColumns,
    { key: "notes", header: text.columns.notes, wrap: true, className: "text-mute", cell: (row) => row.note ?? <Blank /> },
  ];
  const tag = !flight ? null : group.missingPassports > 0 ? (
    <StatusTag tone="warning">{text.missingTag(group.missingPassports)}</StatusTag>
  ) : (
    <StatusTag tone="registered">{text.allReceived}</StatusTag>
  );
  return (
    <Surface variant="card" id={PARTICIPANTS_SECTION} tabIndex={-1} aria-label={text.table(name)} className={className}>
      <SectionHeader
        title={text.title(name)}
        subtitle={
          flight
            ? text.summary(group.registered, group.passportsReceived, group.missingPassports)
            : text.summaryEvent(group.registered, seatsFree(group))
        }
        trailing={tag}
      />
      {participants.isPending ? <RowsSkeleton rows={8} /> : null}
      {participants.isError ? <ErrorState onRetry={() => void participants.refetch()} /> : null}
      {participants.data ? (
        <DataTable
          label={text.table(name)}
          columns={columns}
          rows={participants.data}
          rowKey={(row) => row.customerId}
          rowHref={(row) => `/customers/${row.customerId}`}
          empty={<EmptyState message={text.empty} />}
          pageSize={CARD_PAGE_SIZE}
          pageResetKey={group.id}
        />
      ) : null}
    </Surface>
  );
}

/** Phones: who still owes a passport, each linking to the customer. */
export function MissingPassportsCard({ group }: { group: GroupSummary }) {
  const { groupsCopy: copy } = useCopy();
  const participants = useGroupParticipants(group.id);
  const text = copy.missing;
  const missing = participants.data?.filter((person) => person.passport === "missing") ?? [];
  return (
    <Surface variant="card" compact id={MISSING_SECTION} tabIndex={-1} aria-label={text.title} className="pt-4 pb-2">
      <SectionHeader
        title={text.title}
        trailing={<CountPill label={text.count(group.missingPassports)}>{group.missingPassports}</CountPill>}
        className="mb-1"
      />
      {participants.isPending ? <RowsSkeleton rows={Math.max(1, group.missingPassports)} /> : null}
      {participants.isError ? <ErrorState onRetry={() => void participants.refetch()} /> : null}
      {participants.data && missing.length === 0 ? <EmptyState message={text.none} /> : null}
      {missing.length > 0 ? (
        <>
          <ul>
            {missing.map((person) => (
              <ListRow
                as="li"
                key={person.customerId}
                to={`/customers/${person.customerId}`}
                leading={<Avatar initial={person.firstName.charAt(0)} />}
                title={fullName(person)}
                description={<ContactLine person={person} />}
                trailing={<StatusTag tone="warning">{copy.participants.passport.missing}</StatusTag>}
              />
            ))}
          </ul>
          <p className="pt-2 pb-1.5 text-caption text-mute">{text.note}</p>
        </>
      ) : null}
    </Surface>
  );
}

/** Phones: an event's participants, the first few until "show all". */
export function ParticipantsList({ group }: { group: GroupSummary }) {
  const { groupsCopy: copy } = useCopy();
  const participants = useGroupParticipants(group.id);
  const [expanded, setExpanded] = useState(false);
  const text = copy.participants;
  const rows = participants.data ?? [];
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS);
  return (
    <Surface variant="card" compact id={PARTICIPANTS_SECTION} tabIndex={-1} aria-label={text.table(plainName(group.shortName))} className="pt-4 pb-2">
      <SectionHeader
        title={text.phoneTitle}
        trailing={<CountPill label={text.count(group.registered)}>{group.registered}</CountPill>}
        className="mb-1"
      />
      {participants.isPending ? <RowsSkeleton rows={4} /> : null}
      {participants.isError ? <ErrorState onRetry={() => void participants.refetch()} /> : null}
      {participants.data && rows.length === 0 ? <EmptyState message={text.empty} /> : null}
      {shown.length > 0 ? (
        <ul>
          {shown.map((person) => (
            <ListRow
              as="li"
              key={person.customerId}
              to={`/customers/${person.customerId}`}
              leading={<Avatar initial={person.firstName.charAt(0)} />}
              title={fullName(person)}
              description={<ContactLine person={person} />}
            />
          ))}
        </ul>
      ) : null}
      {rows.length > PREVIEW_ROWS ? (
        <p className="pt-1 pb-3">
          <TextLink onClick={() => setExpanded((open) => !open)}>{expanded ? text.showFewer : text.showAll(rows.length)}</TextLink>
        </p>
      ) : null}
    </Surface>
  );
}

interface OrbProps {
  group: GroupSummary;
  phone: boolean;
  /** Brings the participants (desktop) or the missing passports (phone) into view. */
  onShow: () => void;
}

/** Flight readiness: the share of participants whose passport is in, on the orb. */
export function ReadinessCard({ group, phone, onShow }: OrbProps) {
  const { groupsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const text = copy.readiness;
  const layout = phone ? ORB.phone : ORB.desktop;
  const missing = group.missingPassports;
  return (
    <OrbCard
      label={text.label(plainName(group.shortName))}
      compact={phone}
      orb={layout.orb}
      stripBasis={layout.stripBasis}
      className={layout.className}
      strip={
        <>
          <p className={cx("leading-none font-light text-ink", phone ? "text-[44px]" : "text-[60px]")}>
            {copy.percent(group.readiness ?? 0)}{" "}
            <br />
            <span className={cx("text-faint", phone ? "text-[32px]" : "text-[40px]")}>{text.word}</span>
          </p>
          <span className="flex-1" />
          <p className={cx("font-medium text-ink", phone && "text-small")}>{text.of(group.passportsReceived, group.registered)}</p>
          <p className={cx("text-mute-2", phone ? "text-caption" : "text-small")}>{text.passportsIn}</p>
        </>
      }
      side={
        <>
          <p className="text-caption text-mute">
            {group.shortName}
            <br />
            {groupWhenShort(group, copy, locale)}
          </p>
          {missing > 0 ? (
            <GooButton size="sm" onClick={onShow}>
              {phone ? text.missingShort : text.missing(missing)}
            </GooButton>
          ) : (
            <p className="text-caption font-medium text-ink">{text.allIn}</p>
          )}
        </>
      }
    />
  );
}

/** What an event has instead of readiness: its day, the Hebrew date and how long until it. */
export function EventDateCard({ group, phone, onShow }: OrbProps) {
  const { groupsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const layout = phone ? ORB.phone : ORB.desktop;
  const start = dayAt(group.startsOn);
  return (
    <OrbCard
      label={copy.event.label(plainName(group.shortName))}
      compact={phone}
      orb={layout.orb}
      stripBasis={layout.stripBasis}
      className={layout.className}
      strip={
        <>
          {group.dateLabel ? (
            <p className="text-display-3 font-light text-ink">{groupDate(group, locale)}</p>
          ) : (
            <>
              <p className="text-display font-light text-ink">
                {formatWeekday(start, locale)}{" "}
                <br />
                <span className="text-faint">{formatDayMonth(start, locale)}</span>
              </p>
              <p className={cx("mt-2 text-mute-2", phone ? "text-caption" : "text-small")}>{formatHebrewDate(start, locale)}</p>
            </>
          )}
          <span className="flex-1" />
          <p className={cx("font-medium text-ink", phone && "text-small")}>{copy.event.countdown(daysBetween(today(), start))}</p>
        </>
      }
      side={
        <>
          <p className="text-caption text-mute">
            {group.shortName}
            <br />
            {copy.seatsLeft(seatsFree(group))}
          </p>
          <GooButton size="sm" onClick={onShow}>
            {copy.event.toParticipants}
          </GooButton>
        </>
      }
    />
  );
}

/** A flight leg: "18.11 · 06:40 · נתב״ג ← ורשה", or without the route on phones. */
function LegValue({ leg, withRoute }: { leg: FlightLeg; withRoute: boolean }) {
  const { groupsCopy: copy } = useCopy();
  const { locale } = useLocale();
  return (
    <>
      {formatDayMonth(dayAt(leg.date), locale)}
      {copy.sep}
      <Ltr>{leg.time}</Ltr>
      {withRoute ? (
        <>
          {copy.sep}
          <bdi>{leg.from}</bdi> {copy.flight.arrow} <bdi>{leg.to}</bdi>
        </>
      ) : null}
    </>
  );
}

/** Flight details on glass. Anything not booked yet shows a placeholder. Phones leave out the route and the airline, as designed. */
export function FlightCard({ flight, phone }: { flight: Flight | null; phone: boolean }) {
  const { groupsCopy: copy } = useCopy();
  const text = copy.flight;
  const placeholder = text.placeholder;
  const leg = (value: FlightLeg | null | undefined) => (value ? <LegValue leg={value} withRoute={!phone} /> : placeholder.leg);
  const items: KeyValueItem[] = [
    { key: "outbound", label: text.outbound, value: leg(flight?.outbound) },
    { key: "inbound", label: text.inbound, value: leg(flight?.inbound) },
    ...(phone ? [] : [{ key: "airline", label: text.airline, value: flight?.airline ?? placeholder.airline }]),
    { key: "hotel", label: text.hotel, value: flight?.hotel ?? placeholder.hotel },
    { key: "guide", label: text.guide, value: flight?.guide ?? placeholder.guide },
  ];
  return (
    <Surface variant="glass" compact={phone} aria-label={text.title} className={phone ? "pt-4 pb-2" : undefined}>
      <SectionHeader title={text.title} surface="glass" trailing={phone ? undefined : <Icon name="groups" />} className={phone ? "mb-1" : undefined} />
      <KeyValue items={items} surface="glass" />
    </Surface>
  );
}

/** An event's details where a flight's would be: date, places, registered and places left. */
export function EventDetailsCard({ group, phone }: { group: GroupSummary; phone: boolean }) {
  const { groupsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const text = copy.event;
  const items: KeyValueItem[] = [
    { key: "date", label: text.date, value: groupDate(group, locale) },
    { key: "capacity", label: text.capacity, value: formatNumber(group.capacity) },
    { key: "registered", label: text.registered, value: formatNumber(group.registered) },
    { key: "free", label: text.free, value: formatNumber(seatsFree(group)) },
    ...(group.womenOnly ? [{ key: "audience", label: text.audience, value: copy.womenOnly }] : []),
  ];
  return (
    <Surface variant="glass" compact={phone} aria-label={text.details} className={phone ? "pt-4 pb-2" : undefined}>
      <SectionHeader title={text.details} surface="glass" className={phone ? "mb-1" : undefined} />
      <KeyValue items={items} surface="glass" />
    </Surface>
  );
}
