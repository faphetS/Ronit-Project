import { useState } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useCloseMonday } from "../../data/queries";
import type { FieldMapping, ImportRun } from "../../data/types";
import { cx } from "../../lib/cx";
import { formatNumber } from "../../lib/format";
import { BigNumber } from "../../ui/BigNumber";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { DataTable, type DataColumn } from "../../ui/DataTable";
import { GooButton } from "../../ui/GooButton";
import { MeterRow } from "../../ui/MeterRow";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, LoadingBlock } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Steps } from "../../ui/Steps";
import { Surface } from "../../ui/Surface";
import { useToast } from "../../ui/toast-context";
import { RowsSkeleton } from "../groups/GroupsSkeleton";
import { CHECK_TONE, closedText, selectedBoards, stepItems } from "./importRun";

interface CardProps {
  /** Undefined while the import loads: the card shows a skeleton. */
  run: ImportRun | undefined;
  phone: boolean;
  className?: string;
}

/** The result on black: errors, leads moved in, and what was found, merged and kept. The page's one hero number. */
export function ResultCard({ run, phone, className }: CardProps) {
  const { importCopy: copy } = useCopy();
  const text = copy.result;
  // On phones the top bar names the screen, so this is the page heading.
  const Heading = phone ? "h1" : "h2";
  if (!run) {
    return (
      <Surface variant="ink" compact={phone} aria-label={text.label} className={cx("lg:px-[30px] lg:py-7", className)}>
        <LoadingBlock lines={4} onDark />
      </Surface>
    );
  }
  const errors = run.totals.errors;
  const moved = phone ? text.movedPhone : text.moved;
  const stats = [
    { key: "found", value: run.totals.itemsFound, label: phone ? text.itemsFoundPhone : text.itemsFound(selectedBoards(run)) },
    { key: "merged", value: run.totals.duplicatesMerged, label: phone ? text.mergedPhone : text.merged },
    { key: "notes", value: run.totals.notesSaved, label: phone ? text.notesPhone : text.notes },
  ];
  return (
    <Surface
      variant="ink"
      compact={phone}
      aria-label={text.label}
      className={cx("flex flex-col", phone ? "gap-3.5" : "gap-[22px] lg:px-[30px] lg:py-7", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <Heading className="text-title font-medium text-cream">{text.status[run.status]}</Heading>
        <StatusTag tone={errors > 0 ? "warning" : "registered"} onDark>
          {text.errors(errors)}
        </StatusTag>
      </div>
      <div className={cx("flex items-end", phone ? "gap-3" : "gap-[18px]")}>
        <BigNumber value={run.totals.leadsImported} size={phone ? 72 : 104} surface="ink" countUp />
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
        {/* The full report has no service yet. */}
        {phone ? null : (
          <Button variant="outline" onDark disabled>
            {text.fullReport}
          </Button>
        )}
      </div>
    </Surface>
  );
}

/** The five steps of the import, each with a short note. */
export function StepsCard({ run, phone, className }: CardProps) {
  const { importCopy: copy } = useCopy();
  const { locale } = useLocale();
  const items = run ? stepItems(run, copy, locale, phone) : [];
  const done = items.filter((item) => item.state === "done").length;
  return (
    <Surface variant="glass" compact={phone} aria-label={copy.steps.title} className={cx(phone && "px-3 py-4", className)}>
      <SectionHeader
        title={copy.steps.title}
        trailing={run ? copy.steps.progress(done, items.length) : undefined}
        surface="glass"
        className={phone ? "px-1.5" : undefined}
      />
      {run ? <Steps steps={items} label={copy.steps.title} orientation="vertical" surface="glass" /> : <LoadingBlock lines={5} />}
    </Surface>
  );
}

/** The Monday boards and their item counts. Desktop shows each board's checkbox, read-only now that the import is done. */
export function BoardsCard({ run, phone, className }: CardProps) {
  const { importCopy: copy } = useCopy();
  const text = copy.boards;
  const boards = run?.boards ?? [];
  const largest = Math.max(1, ...boards.map((board) => board.items));
  return (
    <Surface variant="card" compact={phone} aria-label={text.label} className={className}>
      <SectionHeader title={text.title} trailing={run ? text.items(formatNumber(run.totals.itemsFound)) : undefined} />
      {!run ? <RowsSkeleton rows={4} avatar={false} /> : null}
      {run && boards.length === 0 ? <EmptyState message={text.empty} /> : null}
      {boards.length > 0 ? (
        <ul>
          {boards.map((board) => (
            <MeterRow
              as="li"
              key={board.id}
              title={board.name}
              detail={phone ? undefined : text.groups(board.groups)}
              figure={<BigNumber as="span" value={board.items} size={22} />}
              share={board.items / largest}
              meterLabel={text.items(formatNumber(board.items))}
              control={phone ? undefined : <input type="checkbox" checked={board.selected} disabled readOnly className="size-[18px] accent-ink" />}
              className={phone ? undefined : "[&_label]:cursor-default"}
            />
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}

/** Desktop: which Monday column went into which field, and whether it checked out. */
export function MappingCard({ run, className }: Omit<CardProps, "phone">) {
  const { importCopy: copy } = useCopy();
  const text = copy.mapping;
  const columns: DataColumn<FieldMapping>[] = [
    { key: "monday", header: text.columns.monday, isRowHeader: true, cell: (row) => row.mondayColumn },
    { key: "field", header: text.columns.field, cell: (row) => <span className="font-medium text-ink">{text.fields[row.field]}</span> },
    { key: "check", header: text.columns.check, cell: (row) => <StatusTag tone={CHECK_TONE[row.check]}>{text.checks[row.check]}</StatusTag> },
  ];
  return (
    <Surface variant="card" aria-label={text.title} className={className}>
      <SectionHeader title={text.title} trailing={text.hint} />
      {run ? (
        <DataTable
          label={text.table}
          columns={columns}
          rows={run.fields}
          rowKey={(row) => row.field}
          empty={<EmptyState message={text.empty} />}
          animateRows={false}
        />
      ) : (
        <RowsSkeleton rows={6} avatar={false} />
      )}
    </Surface>
  );
}

/** What happens to Monday.com, and closing it once everything came over. Asks first; afterwards shows it closed. */
export function MondayCard({ run, phone, className }: CardProps) {
  const { importCopy: copy } = useCopy();
  const { locale } = useLocale();
  const toast = useToast();
  const closeMonday = useCloseMonday();
  const [confirming, setConfirming] = useState(false);
  const text = copy.monday;
  const closed = run?.monday === "closed";

  const confirm = () => {
    if (!run) return;
    closeMonday.mutate(run.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.show({ message: text.closedToast });
      },
      onError: () => {
        setConfirming(false);
        toast.show({ message: text.failedToast, tone: "warning" });
      },
    });
  };

  return (
    <Surface
      variant={phone ? "card" : "glass"}
      compact={phone}
      aria-label={text.title}
      className={cx("flex flex-col", phone ? "gap-2.5" : "gap-3", className)}
    >
      <h2 className="text-title font-medium text-ink">{text.title}</h2>
      {!run ? <LoadingBlock lines={3} /> : null}
      {run ? (
        <>
          <p className="text-small text-copy">{closed ? closedText(run.mondayClosedAt, copy, locale) : phone ? text.bodyPhone : text.body}</p>
          {phone ? null : <p className="text-small text-mute">{text.next}</p>}
          {closed ? (
            <span className={cx("pt-1", !phone && "mt-auto")}>
              <StatusTag tone="registered">{text.closedTag}</StatusTag>
            </span>
          ) : (
            <Button
              size={phone ? "md" : "sm"}
              onClick={() => setConfirming(true)}
              className={cx("h-auto! py-2.5 text-center leading-tight! whitespace-normal!", phone ? "min-h-[46px]" : "mt-auto min-h-[38px]")}
            >
              {text.close}
            </Button>
          )}
        </>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={text.confirm.title}
        description={text.confirm.body}
        confirmLabel={text.confirm.action}
        pending={closeMonday.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </Surface>
  );
}
