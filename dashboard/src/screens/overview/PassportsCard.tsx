import { useId } from "react";
import { useCopy } from "../../content/locale";
import { usePassportIntakes } from "../../data/queries";
import { formatNumber, formatTime } from "../../lib/format";
import { useFirstKeys } from "../../motion/cascade";
import { Avatar } from "../../ui/Avatar";
import { ListRow } from "../../ui/ListRow";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { INTAKE_TONE, SHOWN, initialOf, isToday } from "./overview-model";
import { RowsSkeleton } from "./OverviewStates";

/** Desktop: passports that came in on WhatsApp today, and how many wait for a manual review. */
export function PassportsCard({ className }: { className?: string }) {
  const { overview } = useCopy();
  const copy = overview.passports;
  const intakes = usePassportIntakes();
  const headingId = useId();
  const all = intakes.data ?? [];
  const todays = all.filter((intake) => isToday(intake.receivedAt));
  const isFirst = useFirstKeys(todays.map((intake) => intake.id));
  const waiting = all.filter((intake) => intake.result === "needs-review").length;
  return (
    <Surface variant="glass" aria-labelledby={headingId} className={className}>
      <SectionHeader
        id={headingId}
        title={copy.title}
        trailing={waiting > 0 ? <StatusTag tone="warning">{copy.toReview(waiting)}</StatusTag> : undefined}
      />
      {intakes.isPending ? (
        <>
          <Skeleton className="mb-2 h-8 w-28" />
          <RowsSkeleton rows={SHOWN.passports} circle="avatar" glass />
        </>
      ) : null}
      {intakes.isError && !intakes.data ? <ErrorState onRetry={() => void intakes.refetch()} /> : null}
      {intakes.data ? (
        <>
          <p className="mb-2 text-display-3 font-light text-ink">
            {formatNumber(todays.length)} <span className="text-faint">{copy.today}</span>
          </p>
          {todays.length > 0 ? (
            <ul>
              {todays.slice(0, SHOWN.passports).map((intake, index) => (
                <ListRow
                  key={intake.id}
                  as="li"
                  row={{ index, cascade: isFirst(intake.id) }}
                  surface="glass"
                  to={intake.customerId ? `/customers/${intake.customerId}` : undefined}
                  leading={<Avatar initial={initialOf(intake.name)} tone="glass" />}
                  title={intake.name}
                  description={
                    <>
                      {formatTime(new Date(intake.receivedAt))} ·{" "}
                      {/* A match says what happened to the card; otherwise the reason, as stored (in Hebrew). */}
                      {intake.result === "matched" ? copy.addedToCard : <bdi>{intake.reason}</bdi>}
                    </>
                  }
                  trailing={<StatusTag tone={INTAKE_TONE[intake.result]}>{copy.result[intake.result]}</StatusTag>}
                />
              ))}
            </ul>
          ) : (
            <EmptyState message={copy.empty} />
          )}
          <TextLink to="/customers" className="mt-2 inline-block">
            {copy.link}
          </TextLink>
        </>
      ) : null}
    </Surface>
  );
}
