import { useCopy, useLocale } from "../../content/locale";
import { ApiError } from "../../data/http/client";
import { useCan, useCopyNow } from "../../data/queries";
import type { MondayCopy } from "../../data/types";
import { cx } from "../../lib/cx";
import { formatNumber } from "../../lib/format";
import { BigNumber } from "../../ui/BigNumber";
import { Button } from "../../ui/Button";
import { DataTable, type DataColumn } from "../../ui/DataTable";
import { GooButton } from "../../ui/GooButton";
import { MeterRow } from "../../ui/MeterRow";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, LoadingBlock } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { useToast } from "../../ui/toast-context";
import { RowsSkeleton } from "../groups/GroupsSkeleton";
import { whenText } from "./importRun";

interface CardProps {
  /** Undefined while it loads: the card shows a skeleton. */
  copy: MondayCopy | undefined;
  phone: boolean;
  className?: string;
}

/** "העתקה עכשיו", for admins: starts a copy; the page follows it until it's done. */
function CopyNowButton({ copy, phone }: { copy: MondayCopy; phone: boolean }) {
  const { importCopy } = useCopy();
  const text = importCopy.result;
  const copyNow = useCopyNow();
  const toast = useToast();
  const running = copy.lastRun?.status === "running" || copyNow.isPending;
  const start = () =>
    copyNow.mutate(undefined, {
      onSuccess: () => toast.show({ message: text.started }),
      onError: (error) => {
        const code = error instanceof ApiError ? error.code : "";
        if (code === "COPY_RUNNING") toast.show({ message: text.started });
        else toast.show({ message: code === "COPY_TOO_SOON" ? text.tooSoon : text.failedToStart, tone: "warning" });
      },
    });
  return (
    <Button variant="outline" onDark size={phone ? "sm" : "md"} onClick={start} disabled={running || !copy.enabled}>
      {running ? text.copying : text.copyNow}
    </Button>
  );
}

/** The state of the copy on black: when it last ran, the leads it brought, and what else came over. The page's one hero number. */
export function ResultCard({ copy, phone, className }: CardProps) {
  const { importCopy } = useCopy();
  const { locale } = useLocale();
  const canCopy = useCan("import", "full");
  const text = importCopy.result;
  // On phones the top bar names the screen, so this is the page heading.
  const Heading = phone ? "h1" : "h2";
  if (!copy) {
    return (
      <Surface variant="ink" compact={phone} aria-label={text.label} className={cx("lg:px-[30px] lg:py-7", className)}>
        <LoadingBlock lines={4} onDark />
      </Surface>
    );
  }
  const run = copy.lastRun;
  const trouble = run?.status === "failed" || run?.status === "skipped";
  const moved = phone ? text.movedPhone : text.moved;
  const stats = [
    { key: "archived", value: copy.totals.archivedLeads, label: phone ? text.archivedPhone : text.archived },
    { key: "customers", value: copy.totals.customers, label: phone ? text.customersPhone : text.customers },
    { key: "no-phone", value: copy.totals.withoutPhone, label: phone ? text.withoutPhonePhone : text.withoutPhone },
  ];
  return (
    <Surface
      variant="ink"
      compact={phone}
      aria-label={text.label}
      className={cx("flex flex-col", phone ? "gap-3.5" : "gap-[22px] lg:px-[30px] lg:py-7", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <Heading className="text-title font-medium text-cream">{run ? text.status[run.status] : text.notYet}</Heading>
        <StatusTag tone={trouble ? "warning" : "registered"} onDark>
          {copy.lastCopiedAt ? text.copiedAt(whenText(copy.lastCopiedAt, importCopy, locale)) : text.notYet}
        </StatusTag>
      </div>
      {trouble ? <p className="-mt-2 text-small text-ink-mute">{text.keptPrevious}</p> : null}
      <div className={cx("flex items-end", phone ? "gap-3" : "gap-[18px]")}>
        <BigNumber value={copy.totals.leads} size={phone ? 72 : 104} surface="ink" countUp />
        <p className={cx("text-ink-mute", phone ? "pb-2 text-small" : "pb-3 text-[16px] leading-[1.55]")}>
          {moved.first}
          <br />
          {moved.second}
        </p>
      </div>
      {phone ? (
        <dl className="grid grid-cols-3 gap-2.5">
          {stats.map((stat) => (
            // Number above its label, in the order a screen reader still reads as label then value.
            <div key={stat.key} className="flex flex-col-reverse justify-end rounded-[18px] bg-white/6 p-3">
              <dt className="mt-1 text-caption text-ink-mute">{stat.label}</dt>
              <BigNumber as="dd" value={stat.value} size={26} surface="ink" />
            </div>
          ))}
        </dl>
      ) : (
        <dl className="flex items-stretch">
          {stats.map((stat, index) => (
            <div
              key={stat.key}
              className={cx(
                "flex min-w-0 flex-1 flex-col-reverse justify-end",
                index > 0 && "border-s border-white/14 ps-5",
                index < stats.length - 1 && "pe-5",
              )}
            >
              <dt className="mt-1.5 text-small text-ink-mute">{stat.label}</dt>
              <BigNumber as="dd" value={stat.value} size={40} surface="ink" />
            </div>
          ))}
        </dl>
      )}
      <div className={cx("flex flex-wrap items-center gap-2.5", !phone && "mt-auto")}>
        <GooButton to="/leads" tone="light">
          {text.toLeads}
        </GooButton>
        {canCopy ? <CopyNowButton copy={copy} phone={phone} /> : null}
      </div>
    </Surface>
  );
}

/** When the copy runs: the schedule, the next and the last copy. Says so when it's switched off. */
export function ScheduleCard({ copy, phone, className }: CardProps) {
  const { importCopy } = useCopy();
  const { locale } = useLocale();
  const text = importCopy.schedule;
  return (
    <Surface variant="glass" compact={phone} aria-label={text.title} className={cx("flex flex-col gap-2.5", className)}>
      <SectionHeader title={text.title} surface="glass" className="mb-0" />
      {!copy ? <LoadingBlock lines={3} /> : null}
      {copy && !copy.enabled ? <p className="text-small text-status-warning">{text.off}</p> : null}
      {copy?.enabled ? (
        <>
          <p className="font-medium text-ink">{text.every}</p>
          {copy.nextRunAt ? <p className="text-small text-copy">{text.next(whenText(copy.nextRunAt, importCopy, locale))}</p> : null}
          {copy.lastCopiedAt ? <p className="text-small text-copy">{text.last(whenText(copy.lastCopiedAt, importCopy, locale))}</p> : null}
        </>
      ) : null}
      {copy ? <p className={cx("text-small text-mute", !phone && "mt-auto")}>{text.readOnly}</p> : null}
    </Surface>
  );
}

/** The Monday boards being copied, with their item counts. */
export function BoardsCard({ copy, phone, className }: CardProps) {
  const { importCopy } = useCopy();
  const text = importCopy.boards;
  const boards = copy?.boards ?? [];
  const largest = Math.max(1, ...boards.map((board) => board.items));
  return (
    <Surface variant="card" compact={phone} aria-label={text.label} className={className}>
      <SectionHeader title={text.title} trailing={copy ? text.items(formatNumber(copy.totals.itemsFound)) : undefined} />
      {!copy ? <RowsSkeleton rows={4} avatar={false} /> : null}
      {copy && boards.length === 0 ? <EmptyState message={text.empty} /> : null}
      {boards.length > 0 ? (
        <ul>
          {boards.map((board) => (
            <MeterRow
              as="li"
              key={board.id}
              title={board.name}
              detail={text.kind[board.kind]}
              figure={<BigNumber as="span" value={board.items} size={22} />}
              share={board.items / largest}
              meterLabel={text.items(formatNumber(board.items))}
            />
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}

type MappingRow = { monday: string; field: string };

/** Desktop: which Monday column or board goes into what in the dashboard. */
export function MappingCard({ className }: { className?: string }) {
  const { importCopy } = useCopy();
  const text = importCopy.mapping;
  const columns: DataColumn<MappingRow>[] = [
    { key: "monday", header: text.columns.monday, isRowHeader: true, wrap: true, cell: (row) => row.monday },
    { key: "field", header: text.columns.field, wrap: true, cell: (row) => <span className="text-ink">{row.field}</span> },
  ];
  return (
    <Surface variant="card" aria-label={text.title} className={className}>
      <SectionHeader title={text.title} trailing={text.hint} />
      <DataTable label={text.table} columns={columns} rows={[...text.rows]} rowKey={(row) => row.monday} animateRows={false} />
    </Surface>
  );
}

/** Where the work happens until the switch-over. */
export function MondayCard({ phone, className }: { phone: boolean; className?: string }) {
  const { importCopy } = useCopy();
  const text = importCopy.monday;
  return (
    <Surface variant={phone ? "card" : "glass"} compact={phone} aria-label={text.title} className={cx("flex flex-col", phone ? "gap-2.5" : "gap-3", className)}>
      <h2 className="text-title font-medium text-ink">{text.title}</h2>
      <p className="text-small text-copy">{text.body}</p>
      <p className="text-small text-mute">{text.next}</p>
    </Surface>
  );
}
