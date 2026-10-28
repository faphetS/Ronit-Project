import { useId } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { usePassportIntakes } from "../../data/queries";
import type { IntakeResult, PassportIntake } from "../../data/types";
import { now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatTime, maskPhone } from "../../lib/format";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { CountPill } from "../../ui/CountPill";
import { ListRow } from "../../ui/ListRow";
import { Ltr } from "../../ui/Ltr";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState } from "../../ui/states";
import { StatusTag, type StatusTone } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { initialOf, intakesOn } from "./customer-helpers";
import { RowsSkeleton, TilesSkeleton } from "./Skeletons";
import { momentLabel } from "./when";

const RESULT_TONE: Record<IntakeResult, StatusTone> = {
  matched: "registered",
  "new-card": "sent",
  "needs-review": "warning",
};

/** One passport from WhatsApp, as a tile on the black card. */
function IntakeTile({ intake }: { intake: PassportIntake }) {
  const { customersCopy: copy } = useCopy();
  const { locale } = useLocale();
  const when = momentLabel(new Date(intake.receivedAt), now(), locale, copy.when);
  return (
    <li className="flex flex-col gap-2.5 rounded-inner bg-white/6 p-4">
      <div className="flex items-center gap-3">
        <Avatar initial={initialOf(intake.name)} tone="ink" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-cream">{intake.name}</p>
          <p className="text-caption text-ink-mute">
            {when} · {intake.result === "matched" ? <Ltr>{maskPhone(intake.phone)}</Ltr> : intake.reason}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusTag tone={RESULT_TONE[intake.result]} onDark>
          {copy.inbox.result[intake.result]}
        </StatusTag>
        {intake.customerId ? (
          <TextLink to={`/customers/${intake.customerId}`} surface="ink">
            {copy.inbox.open}
            <span className="sr-only">{copy.inbox.whose(intake.name)}</span>
          </TextLink>
        ) : (
          // Reviewing a passport has no service yet, so the button is shown but disabled.
          <Button size="sm" onDark disabled>
            {copy.inbox.review}
            <span className="sr-only">{copy.inbox.whose(intake.name)}</span>
          </Button>
        )}
      </div>
    </li>
  );
}

/** Desktop: the black WhatsApp passport inbox, with today's count and the passports waiting for a manual review. */
export function IntakeInbox({ className }: { className?: string }) {
  const { customersCopy: copy } = useCopy();
  const headingId = useId();
  const intakes = usePassportIntakes();
  const all = intakes.data;
  const today = all ? intakesOn(all, now()).length : null;
  const waiting = all?.filter((intake) => intake.result === "needs-review").length ?? 0;
  return (
    <Surface variant="ink" aria-labelledby={headingId} className={cx("flex flex-col gap-4", className)}>
      <SectionHeader
        id={headingId}
        surface="ink"
        flush
        title={copy.inbox.title}
        titleAddon={today === null ? null : <CountPill surface="ink">{copy.inbox.today(today)}</CountPill>}
        trailing={
          waiting > 0 ? (
            <StatusTag tone="warning" onDark>
              {copy.inbox.waiting(waiting)}
            </StatusTag>
          ) : undefined
        }
      />
      {intakes.isPending ? <TilesSkeleton /> : null}
      {intakes.isError && !intakes.data ? <ErrorState onDark onRetry={() => void intakes.refetch()} /> : null}
      {all && all.length === 0 ? <EmptyState onDark message={copy.inbox.empty} /> : null}
      {all && all.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2.5">
          {all.map((intake) => (
            <IntakeTile key={intake.id} intake={intake} />
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}

/** Phone: today's WhatsApp passports as a list on the black card. Rows with a card open it. */
export function IntakeList() {
  const { customersCopy: copy } = useCopy();
  const headingId = useId();
  const intakes = usePassportIntakes();
  const today = intakes.data ? intakesOn(intakes.data, now()) : null;
  return (
    <Surface variant="ink" compact aria-labelledby={headingId} className="pb-2">
      <SectionHeader
        id={headingId}
        surface="ink"
        flush
        title={copy.inbox.title}
        trailing={today ? <CountPill surface="ink">{copy.inbox.today(today.length)}</CountPill> : undefined}
      />
      {intakes.isPending ? <RowsSkeleton onDark rows={3} /> : null}
      {intakes.isError && !intakes.data ? <ErrorState onDark onRetry={() => void intakes.refetch()} /> : null}
      {today && today.length === 0 ? <EmptyState onDark message={copy.inbox.emptyToday} /> : null}
      {today && today.length > 0 ? (
        <ul className="mt-1.5">
          {today.map((intake) => (
            <ListRow
              key={intake.id}
              as="li"
              surface="ink"
              to={intake.customerId ? `/customers/${intake.customerId}` : undefined}
              leading={<Avatar initial={initialOf(intake.name)} tone="ink" />}
              title={intake.name}
              description={`${formatTime(new Date(intake.receivedAt))} · ${intake.result === "matched" ? copy.inbox.result.matched : intake.reason}`}
              trailing={
                <StatusTag tone={RESULT_TONE[intake.result]} onDark>
                  {copy.inbox.resultShort[intake.result]}
                </StatusTag>
              }
            />
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}
