import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import type { Lead } from "../../data/types";
import { dayAt } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber, maskPhone } from "../../lib/format";
import { fadeOut, springs } from "../../motion/springs";
import { cardVariants } from "../../motion/variants";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { Ltr } from "../../ui/Ltr";
import { ErrorState, Skeleton } from "../../ui/states";
import { StatusTag, type StatusTone } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import type { useSettledLeads } from "./leads-data";
import { arrivedOn, BOARD_COLUMNS, telHref, whatsappHref, type BoardColumnKey } from "./leads-model";

type SettledLeads = ReturnType<typeof useSettledLeads>;

/** A column shows this many cards, then a button for the rest. */
const CARD_LIMIT = 20;

/** Each column's heading, filled with its status's color: white text only on the shades dark enough for it. */
const HEAD_CLASS: Record<BoardColumnKey | "not-relevant", string> = {
  new: "bg-status-new text-ink",
  working: "bg-status-talking-deep text-paper",
  "no-answer": "bg-status-warning text-paper",
  registered: "bg-status-registered-deep text-paper",
  "not-relevant": "bg-status-irrelevant text-ink",
};

interface LeadsKanbanProps {
  /** The open leads (every status but not-relevant) for the board's day and filters. */
  open: SettledLeads;
  /** The not-relevant ones, folded into the last column. */
  closed: SettledLeads;
  selectedId?: string;
  leadHref: (id: string) => string;
}

/**
 * The leads by status, one column each: new, in progress (talking or details sent, told apart by a tag), no answer
 * and registered; the not-relevant ones fold into a narrow last column. A card opens the lead; statuses change in Monday.
 */
export function LeadsKanban({ open, closed, selectedId, leadHref }: LeadsKanbanProps) {
  const { leadsCopy: copy } = useCopy();
  const [showClosed, setShowClosed] = useState(false);

  if (open.isError || closed.isError) {
    const retry = () => {
      void open.refetch();
      void closed.refetch();
    };
    return (
      <Surface variant="glass" aria-label={copy.board.label}>
        <ErrorState onRetry={retry} />
      </Surface>
    );
  }
  if (!open.data || !closed.data) return <KanbanSkeleton />;

  const openLeads = open.data;
  return (
    <section
      aria-label={copy.board.label}
      aria-busy={open.isUpdating || closed.isUpdating || undefined}
      className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
    >
      <div className={cx("grid items-start gap-4", showClosed ? "min-w-[1240px] grid-cols-5" : "min-w-[1150px] grid-cols-[repeat(4,minmax(0,1fr))_11rem]")}>
        {BOARD_COLUMNS.map((column) => (
          <BoardColumn
            key={column.key}
            name={copy.board.columns[column.key]}
            headClass={HEAD_CLASS[column.key]}
            leads={openLeads.filter((lead) => column.statuses.includes(lead.status))}
            selectedId={selectedId}
            leadHref={leadHref}
          />
        ))}
        {showClosed ? (
          <BoardColumn
            name={copy.board.columns["not-relevant"]}
            headClass={HEAD_CLASS["not-relevant"]}
            leads={closed.data}
            selectedId={selectedId}
            leadHref={leadHref}
            footer={<ColumnButton onClick={() => setShowClosed(false)}>{copy.board.hideCards}</ColumnButton>}
          />
        ) : (
          <FoldedColumn count={closed.data.length} onShow={() => setShowClosed(true)} />
        )}
      </div>
    </section>
  );
}

interface BoardColumnProps {
  name: string;
  headClass: string;
  leads: Lead[];
  selectedId?: string;
  leadHref: (id: string) => string;
  footer?: ReactNode;
}

function BoardColumn({ name, headClass, leads, selectedId, leadHref, footer }: BoardColumnProps) {
  const { leadsCopy: copy } = useCopy();
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? leads : leads.slice(0, CARD_LIMIT);
  return (
    <motion.section variants={cardVariants} aria-labelledby={headingId} className="surface-glass flex min-w-0 flex-col gap-2.5 rounded-card p-2.5">
      <ColumnHeading id={headingId} name={name} count={leads.length} headClass={headClass} />
      <ul className="flex flex-col gap-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((lead) => (
            <LeadCard key={lead.id} lead={lead} selected={lead.id === selectedId} href={leadHref(lead.id)} />
          ))}
        </AnimatePresence>
      </ul>
      {leads.length === 0 ? <p className="px-2 pb-2 text-caption text-mute">{copy.board.empty}</p> : null}
      {leads.length > shown.length ? <ColumnButton onClick={() => setExpanded(true)}>{copy.board.more(leads.length - shown.length)}</ColumnButton> : null}
      {footer}
    </motion.section>
  );
}

function ColumnHeading({ id, name, count, headClass }: { id: string; name: string; count: number; headClass: string }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <h3 id={id} className={cx("flex h-[42px] items-center gap-2 rounded-2xl px-3.5 text-[15px] font-medium", headClass)}>
      <span className="min-w-0 truncate">{name}</span>
      <span className="ms-auto inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-paper/30 px-2 text-caption tabular-nums">
        <span aria-hidden="true">{formatNumber(count)}</span>
        <span className="sr-only">{copy.leadCount(count)}</span>
      </span>
    </h3>
  );
}

/** The not-relevant leads, folded to a count until asked for. */
function FoldedColumn({ count, onShow }: { count: number; onShow: () => void }) {
  const { leadsCopy: copy } = useCopy();
  const headingId = useId();
  return (
    <motion.section variants={cardVariants} aria-labelledby={headingId} className="surface-glass flex min-w-0 flex-col gap-2.5 rounded-card p-2.5">
      <ColumnHeading id={headingId} name={copy.board.columns["not-relevant"]} count={count} headClass={HEAD_CLASS["not-relevant"]} />
      {count > 0 ? <ColumnButton onClick={onShow}>{copy.board.showCards}</ColumnButton> : <p className="px-2 pb-2 text-caption text-mute">{copy.board.empty}</p>}
    </motion.section>
  );
}

function ColumnButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 rounded-[14px] border border-dashed border-status-irrelevant text-small text-copy transition-colors hover:bg-paper/70"
    >
      {children}
    </button>
  );
}

/** What a card says under the status: in talks or details sent, or how many calls went unanswered. */
function cardTag(lead: Lead, copy: ReturnType<typeof useCopy>["leadsCopy"]): { tone: StatusTone; text: string } | null {
  if (lead.status === "talking") return { tone: "talking", text: copy.status.talking };
  if (lead.status === "details-sent") return { tone: "sent", text: copy.status["details-sent"] };
  if (lead.status === "no-answer" && lead.calls > 0) return { tone: "warning", text: copy.board.attempts(lead.calls) };
  return null;
}

function LeadCard({ lead, selected, href }: { lead: Lead; selected: boolean; href: string }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const tag = cardTag(lead, copy);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: fadeOut }}
      transition={springs.surface}
      className={cx("relative rounded-inner p-3.5 shadow-card transition-colors", selected ? "bg-cream ring-1 ring-ink/15 ring-inset" : "bg-paper")}
    >
      <div className="flex items-baseline justify-between gap-2">
        {/* The name's link covers the card, so a click anywhere opens the lead; the contact buttons sit above it. */}
        <Link
          to={href}
          aria-current={selected ? "page" : undefined}
          className="min-w-0 font-medium break-words text-ink after:absolute after:inset-0 after:rounded-inner"
        >
          {lead.name}
        </Link>
        <span className="shrink-0 text-caption text-mute">{formatDayMonth(dayAt(arrivedOn(lead)), locale)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {lead.service ? <Chip>{copy.services[lead.service]}</Chip> : null}
        <Chip>{copy.sources[lead.source]}</Chip>
        {lead.archived ? <Chip>{copy.archived}</Chip> : null}
      </div>
      {tag ? (
        <div className="mt-2">
          <StatusTag tone={tag.tone}>{tag.text}</StatusTag>
        </div>
      ) : null}
      <div className="relative z-10 mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="text-small text-copy">
          <Ltr>{maskPhone(lead.phone)}</Ltr>
        </span>
        <span className="flex gap-1.5">
          <ContactLink href={whatsappHref(lead.phone)} icon="chat" label={copy.board.whatsapp(lead.name)} newTab />
          <ContactLink href={telHref(lead.phone)} icon="phone" label={copy.board.call(lead.name)} />
        </span>
      </div>
    </motion.li>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-sand-light px-2.5 py-0.5 text-caption text-copy">{children}</span>;
}

function ContactLink({ href, icon, label, newTab = false }: { href: string; icon: IconName; label: string; newTab?: boolean }) {
  return (
    <a
      href={href}
      aria-label={label}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      className="inline-flex size-10 items-center justify-center rounded-full bg-sand-light text-ink transition-colors hover:bg-cream"
    >
      <Icon name={icon} size={16} />
    </a>
  );
}

/** Five columns of card outlines. */
function KanbanSkeleton() {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className="-mx-1 overflow-hidden px-1">
      <span className="sr-only">{states.loading}</span>
      <div aria-hidden="true" className="grid min-w-[1150px] grid-cols-[repeat(4,minmax(0,1fr))_11rem] items-start gap-4">
        {[3, 2, 2, 1, 0].map((cards, column) => (
          <div key={column} className="surface-glass flex flex-col gap-2.5 rounded-card p-2.5">
            <Skeleton className="h-[42px] w-full rounded-2xl" />
            {Array.from({ length: cards }, (_, card) => (
              <div key={card} className="flex flex-col gap-2 rounded-inner bg-paper p-3.5 shadow-card">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
