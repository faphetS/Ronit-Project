import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import type { Lead, SettableLeadStatus } from "../../data/types";
import { dayAt } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber } from "../../lib/format";
import { useFirstKeys, type RowMotion } from "../../motion/cascade";
import { CARD_PRESS_SCALE, springs } from "../../motion/springs";
import { cardVariants, rowVariants } from "../../motion/variants";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { Ltr } from "../../ui/Ltr";
import { ErrorState, Skeleton } from "../../ui/states";
import { StatusTag, type StatusTone } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import type { useSettledLeads } from "./leads-data";
import { arrivedOn, BOARD_COLUMNS, boardLeads, moveFor, telHref, whatsappHref, type DropTarget } from "./leads-model";

type SettledLeads = ReturnType<typeof useSettledLeads>;

/** A column shows this many cards, then a button for the rest. */
const CARD_LIMIT = 20;

/** A drag starts once the pointer has moved this far (px), so a plain press still opens the lead. */
const DRAG_DISTANCE = 6;

/** For this long after a drop (ms), a click on a card belongs to the drop and doesn't open the lead. */
const DROP_CLICK_MS = 300;

/** The column a dragged card is over. */
const DROP_HIGHLIGHT = "ring-2 ring-gold/70 ring-inset";

/** Each column's heading, filled with its status's color: white text only on the shades dark enough for it. */
const HEAD_CLASS: Record<DropTarget, string> = {
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
  /** Whether the signed-in person may change statuses: only then do cards drag between columns. */
  canMove?: boolean;
  /** A card was dropped on another column: the lead, and the status that column gives it. */
  onMove?: (lead: Lead, status: SettableLeadStatus) => void;
}

/**
 * Whether the page has scrolled as far as it goes, which brings the whole board into view. Until then the columns stay
 * still and the wheel moves the page, so a column can't catch the wheel with the board half below the fold. Without a
 * page to watch, the columns just scroll.
 */
function useBoardInView() {
  const [inView, setInView] = useState(true);
  const boardRef = useCallback((board: HTMLElement | null) => {
    const page = board?.closest<HTMLElement>(".overflow-y-auto");
    const content = board?.parentElement;
    if (!page || !content) return;
    const check = () => setInView(page.scrollHeight - page.clientHeight - page.scrollTop < 2);
    check();
    page.addEventListener("scroll", check, { passive: true });
    const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    sizes?.observe(page);
    sizes?.observe(content);
    return () => {
      page.removeEventListener("scroll", check);
      sizes?.disconnect();
    };
  }, []);
  return { boardRef, inView };
}

/**
 * The leads by status, one column each: new, in progress (talking or details sent, told apart by a tag), no answer
 * and registered; the not-relevant ones fold into a narrow last column. A card opens the lead. People who may change
 * statuses drag a card to another column, the folded one too, to give it that column's status; the CRM saves it and
 * Monday's label follows. A long column scrolls inside itself, under its heading, so however many leads there are the
 * board fits the view. Cards cascade in as the page opens; a lead whose status changed fades out of its old column and
 * rises into the new one.
 */
export function LeadsKanban({ open, closed, selectedId, leadHref, canMove = false, onMove }: LeadsKanbanProps) {
  const { leadsCopy: copy } = useCopy();
  const [showClosed, setShowClosed] = useState(false);
  const [dragged, setDragged] = useState<Lead | null>(null);
  const droppedAt = useRef(0);
  const justDropped = useCallback(() => Date.now() - droppedAt.current < DROP_CLICK_MS, []);
  const { boardRef, inView } = useBoardInView();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }));

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

  const board = boardLeads(open.data, closed.data);
  const leadOf = (id: string | number) =>
    Object.values(board)
      .flat()
      .find((lead) => lead.id === String(id));
  const nameOf = (id: string | number) => leadOf(id)?.name ?? "";
  const columnName = (id: string | number) => copy.board.columns[String(id) as DropTarget];
  const announcements: Announcements = {
    onDragStart: ({ active }) => copy.board.drag.pickedUp(nameOf(active.id)),
    onDragOver: ({ over }) => (over ? copy.board.drag.over(columnName(over.id)) : undefined),
    onDragEnd: ({ active, over }) => (over ? copy.board.drag.dropped(nameOf(active.id), columnName(over.id)) : copy.board.drag.cancelled(nameOf(active.id))),
    onDragCancel: ({ active }) => copy.board.drag.cancelled(nameOf(active.id)),
  };
  const startDrag = ({ active }: DragStartEvent) => setDragged(leadOf(active.id) ?? null);
  const endDrag = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    droppedAt.current = Date.now();
    const move = moveFor(board, String(active.id), over ? String(over.id) : null);
    if (move) onMove?.(move.lead, move.status);
  };
  const cancelDrag = () => {
    setDragged(null);
    droppedAt.current = Date.now();
  };
  const column = (target: DropTarget, footer?: ReactNode) => (
    <BoardColumn
      key={target}
      target={target}
      name={copy.board.columns[target]}
      headClass={HEAD_CLASS[target]}
      leads={board[target]}
      selectedId={selectedId}
      leadHref={leadHref}
      scrolls={inView}
      canMove={canMove}
      justDropped={justDropped}
      footer={footer}
    />
  );

  return (
    <DndContext sensors={sensors} onDragStart={startDrag} onDragEnd={endDrag} onDragCancel={cancelDrag} accessibility={{ announcements }}>
      <section
        ref={boardRef}
        aria-label={copy.board.label}
        aria-busy={open.isUpdating || closed.isUpdating || undefined}
        className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
      >
        <div className={cx("grid items-start gap-4", showClosed ? "min-w-[1240px] grid-cols-5" : "min-w-[1150px] grid-cols-[repeat(4,minmax(0,1fr))_11rem]")}>
          {BOARD_COLUMNS.map(({ key }) => column(key))}
          {showClosed ? (
            column("not-relevant", <ColumnButton onClick={() => setShowClosed(false)}>{copy.board.hideCards}</ColumnButton>)
          ) : (
            <FoldedColumn count={board["not-relevant"].length} canMove={canMove} onShow={() => setShowClosed(true)} />
          )}
        </div>
      </section>
      {/* No drop animation: the card itself moves into its new column with the board's own motion. */}
      <DragOverlay dropAnimation={null}>{dragged ? <DraggedCard lead={dragged} /> : null}</DragOverlay>
    </DndContext>
  );
}

interface BoardColumnProps {
  /** Which column: the status a card dropped here gets. */
  target: DropTarget;
  name: string;
  headClass: string;
  leads: Lead[];
  selectedId?: string;
  leadHref: (id: string) => string;
  /** Whether the cards scroll now; see useBoardInView. */
  scrolls: boolean;
  canMove: boolean;
  justDropped: () => boolean;
  footer?: ReactNode;
}

function BoardColumn({ target, name, headClass, leads, selectedId, leadHref, scrolls, canMove, justDropped, footer }: BoardColumnProps) {
  const { leadsCopy: copy } = useCopy();
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: target, disabled: !canMove });
  const shown = expanded ? leads : leads.slice(0, CARD_LIMIT);
  const isFirst = useFirstKeys(leads.map((lead) => lead.id));
  return (
    // At its tallest, with the page scrolled to its end, the column fits between the top bar and the page's bottom edge.
    <motion.section
      ref={setNodeRef}
      variants={cardVariants}
      aria-labelledby={headingId}
      className={cx(
        "surface-glass flex max-h-[calc(100dvh-10rem)] min-w-0 flex-col gap-2.5 overflow-hidden rounded-card p-2.5",
        isOver ? DROP_HIGHLIGHT : "",
      )}
    >
      <ColumnHeading id={headingId} name={name} count={leads.length} headClass={headClass} />
      {/* The list reaches the column's edges, so cards pass under the heading and their shadows aren't cut off. */}
      <motion.ul
        layoutScroll
        className={cx(
          "no-scrollbar relative -mx-2.5 -mt-2.5 flex min-h-0 flex-col gap-2.5 px-2.5 pt-2.5 pb-1 empty:hidden last:-mb-2.5 last:pb-2.5",
          scrolls ? "overflow-y-auto" : "overflow-y-hidden",
        )}
      >
        <AnimatePresence mode="popLayout">
          {shown.map((lead, index) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              selected={lead.id === selectedId}
              href={leadHref(lead.id)}
              row={{ index, cascade: isFirst(lead.id) }}
              canMove={canMove}
              justDropped={justDropped}
            />
          ))}
        </AnimatePresence>
      </motion.ul>
      {leads.length === 0 ? <p className="px-2 pb-2 text-caption text-mute">{copy.board.empty}</p> : null}
      {leads.length > shown.length ? <ColumnButton onClick={() => setExpanded(true)}>{copy.board.more(leads.length - shown.length)}</ColumnButton> : null}
      {footer}
    </motion.section>
  );
}

function ColumnHeading({ id, name, count, headClass }: { id: string; name: string; count: number; headClass: string }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <h3 id={id} className={cx("flex h-[42px] shrink-0 items-center gap-2 rounded-2xl px-3.5 text-[15px] font-medium", headClass)}>
      <span className="min-w-0 truncate">{name}</span>
      <span className="ms-auto inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-paper/30 px-2 text-caption tabular-nums">
        <span aria-hidden="true">{formatNumber(count)}</span>
        <span className="sr-only">{copy.leadCount(count)}</span>
      </span>
    </h3>
  );
}

/** The not-relevant leads, folded to a count until asked for. A card dropped here becomes not relevant. */
function FoldedColumn({ count, canMove, onShow }: { count: number; canMove: boolean; onShow: () => void }) {
  const { leadsCopy: copy } = useCopy();
  const headingId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: "not-relevant", disabled: !canMove });
  return (
    <motion.section
      ref={setNodeRef}
      variants={cardVariants}
      aria-labelledby={headingId}
      className={cx("surface-glass flex min-w-0 flex-col gap-2.5 rounded-card p-2.5", isOver ? DROP_HIGHLIGHT : "")}
    >
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
      className="h-11 shrink-0 rounded-[14px] border border-dashed border-status-irrelevant text-small text-copy transition-colors hover:bg-paper/70"
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

interface LeadCardProps {
  lead: Lead;
  selected: boolean;
  href: string;
  row: RowMotion;
  canMove: boolean;
  justDropped: () => boolean;
}

function LeadCard({ lead, selected, href, row, canMove, justDropped }: LeadCardProps) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: lead.id, disabled: !canMove });
  const tag = cardTag(lead, copy);
  const openUnlessDropped = (event: MouseEvent<HTMLAnchorElement>) => {
    if (justDropped()) event.preventDefault();
  };
  return (
    <motion.li
      ref={setNodeRef}
      {...(canMove ? listeners : undefined)}
      data-draggable={canMove || undefined}
      layout="position"
      variants={rowVariants}
      custom={row}
      exit="exit"
      transition={{ layout: springs.surface }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: CARD_PRESS_SCALE }}
      className={cx(
        "lift-shadow relative rounded-inner p-3.5 shadow-card transition-[background-color,opacity]",
        selected ? "bg-cream ring-1 ring-ink/15 ring-inset" : "bg-paper",
        isDragging ? "opacity-40" : "",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        {/* The name's link covers the card, so a click anywhere opens the lead; the contact buttons sit above it. */}
        <Link
          to={href}
          draggable={false}
          onClick={openUnlessDropped}
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
          <Ltr>{lead.phone}</Ltr>
        </span>
        <span className="flex gap-1.5">
          <ContactLink href={whatsappHref(lead.phone)} icon="chat" label={copy.board.whatsapp(lead.name)} newTab />
          <ContactLink href={telHref(lead.phone)} icon="phone" label={copy.board.call(lead.name)} />
        </span>
      </div>
    </motion.li>
  );
}

/** The card under the pointer while it's dragged: lifted and tilted a little, without its links. */
function DraggedCard({ lead }: { lead: Lead }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  return (
    <div className="pointer-events-none w-full rotate-[1.5deg] rounded-inner bg-paper p-3.5 shadow-float ring-1 ring-ink/10">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 font-medium break-words text-ink">{lead.name}</span>
        <span className="shrink-0 text-caption text-mute">{formatDayMonth(dayAt(arrivedOn(lead)), locale)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {lead.service ? <Chip>{copy.services[lead.service]}</Chip> : null}
        <Chip>{copy.sources[lead.source]}</Chip>
      </div>
    </div>
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
