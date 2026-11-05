import { AnimatePresence, motion } from "motion/react";
import { useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { usePassing } from "../motion/passing";
import { useNavigate } from "react-router";
import { cx } from "../lib/cx";
import { useFirstKeys, type RowMotion } from "../motion/cascade";
import { springs } from "../motion/springs";
import { rowVariants } from "../motion/variants";
import { CountPill } from "./CountPill";
import { Pager } from "./Pager";

export interface DataColumn<Row> {
  key: string;
  /** The visible column header. */
  header: string;
  /** Renders this column's cell for a row. */
  cell: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
  /** Keep the header for screen readers only, e.g. over a column of buttons. */
  srOnlyHeader?: boolean;
  /** These cells head their row (th scope="row"). Usually the name column. */
  isRowHeader?: boolean;
  /** Cells stay on one line unless this is set. */
  wrap?: boolean;
  /** Extra classes for this column's cells, like "text-mute". */
  className?: string;
}

/** A group of rows under a header row, like the leads of one trip. */
export interface DataRowGroup<Row> {
  key: string;
  title: ReactNode;
  /** Shown in a CountPill after the title. */
  count?: number;
  /** Small muted text after the count, like "יציאה 18.11". */
  meta?: ReactNode;
  rows: Row[];
}

interface DataTableProps<Row> {
  /** The table's caption, for screen readers. */
  label: string;
  columns: DataColumn<Row>[];
  rowKey: (row: Row) => string;
  /** The rows, when the table is not grouped. */
  rows?: Row[];
  /** Grouped rows, each group under its own header row. Takes the place of `rows`. Empty groups are skipped. */
  groups?: DataRowGroup<Row>[];
  /**
   * Where a row leads. Keep a real link in the row (a PersonCell with `to`) for the keyboard;
   * a click anywhere else on the row follows it too.
   */
  rowHref?: (row: Row) => string | undefined;
  /** For rows that do something other than navigate. */
  onRowClick?: (row: Row) => void;
  /** The open row, like the lead in the side panel. */
  selectedKey?: string | null;
  /** Shown instead of the table when there are no rows, usually an EmptyState. */
  empty?: ReactNode;
  /** Rows cascade in as the page opens, rise in or fade out as filters change, and the rest glide into place. On by default. */
  animateRows?: boolean;
  /**
   * Rows per page. A longer list gets a pager under the table, and a group split by a page's edge keeps its
   * header on both pages.
   */
  pageSize?: number;
  /** Paging starts over at the first page when this changes, like the filters behind the rows. */
  pageResetKey?: string;
  className?: string;
}

/** Rows per page for a table in a card. */
export const CARD_PAGE_SIZE = 10;

interface TableViewProps<Row> extends Omit<DataTableProps<Row>, "rowHref" | "onRowClick" | "pageSize" | "pageResetKey"> {
  onActivate?: (row: Row) => void;
  isClickable: (row: Row) => boolean;
  /** The page on show: each page gets fresh row groups, without the rows of the last one fading out. */
  page?: number;
  /** The page just turned: its rows fade in. */
  fade?: boolean;
}

type NavigatingTableProps<Row> = Omit<TableViewProps<Row>, "onActivate" | "isClickable"> & {
  rowHref: (row: Row) => string | undefined;
  onRowClick?: (row: Row) => void;
};

const ALIGN = { start: "text-start", center: "text-center", end: "text-end" } as const;

// A click on one of these does its own thing; the row does not follow.
const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role='button'], [role='switch']";

/** The body rows as an array, so AnimatePresence sees each row as its own child. */
function renderRows<Row>(
  rows: Row[],
  { columns, rowKey, selectedKey, onActivate, isClickable, animateRows = true }: TableViewProps<Row>,
  isFirst: (key: string) => boolean,
): ReactElement[] {
  return rows.map((row, index) => {
    const key = rowKey(row);
    const selected = key === selectedKey;
    const clickable = Boolean(onActivate) && isClickable(row);
    const onClick = clickable
      ? (event: MouseEvent<HTMLTableRowElement>) => {
          if (event.defaultPrevented || event.button !== 0) return;
          if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
          // Selecting text in a cell is not a click on the row.
          if (window.getSelection()?.type === "Range") return;
          onActivate?.(row);
        }
      : undefined;
    const cells = columns.map((column) => {
      const Cell = column.isRowHeader ? "th" : "td";
      return (
        <Cell
          key={column.key}
          scope={column.isRowHeader ? "row" : undefined}
          className={cx(
            "border-t border-line p-3 align-middle font-normal transition-colors",
            ALIGN[column.align ?? "start"],
            !column.wrap && "whitespace-nowrap",
            selected ? "bg-cream" : "group-hover/row:bg-sand-light/60",
            column.className,
          )}
        >
          {column.cell(row)}
        </Cell>
      );
    });
    const rowClass = cx("group/row", clickable && "cursor-pointer");
    return animateRows ? (
      <motion.tr
        key={key}
        layout="position"
        variants={rowVariants}
        custom={{ index, cascade: isFirst(key) } satisfies RowMotion}
        exit="exit"
        transition={{ layout: springs.surface }}
        onClick={onClick}
        className={rowClass}
      >
        {cells}
      </motion.tr>
    ) : (
      <tr key={key} onClick={onClick} className={rowClass}>
        {cells}
      </tr>
    );
  });
}

function TableView<Row>(props: TableViewProps<Row>) {
  const { label, columns, rows, groups, empty, animateRows = true, page = 1, fade = false, className } = props;
  const visibleGroups = groups?.filter((group) => group.rows.length > 0);
  const hasRows = visibleGroups ? visibleGroups.length > 0 : Boolean(rows?.length);
  // The rows the table first showed cascade in as its page opens; rows a filter adds later rise in together.
  const isFirst = useFirstKeys((visibleGroups ? visibleGroups.flatMap((group) => group.rows) : (rows ?? [])).map(props.rowKey));
  if (!hasRows && empty) return <div className={className}>{empty}</div>;

  // A turned page fades in as a whole; otherwise the rows shown first cascade in and later ones rise in together.
  const body = (bodyRows: Row[]) =>
    animateRows ? <AnimatePresence initial={!fade}>{renderRows(bodyRows, props, isFirst)}</AnimatePresence> : renderRows(bodyRows, props, isFirst);

  return (
    // Wide tables scroll sideways inside their card.
    <div className={cx("-mx-2.5 overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[14.5px]">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cx("px-3 pb-2.5 text-caption font-medium whitespace-nowrap text-mute", ALIGN[column.align ?? "start"])}>
                {column.srOnlyHeader ? <span className="sr-only">{column.header}</span> : column.header}
              </th>
            ))}
          </tr>
        </thead>
        {visibleGroups ? (
          visibleGroups.map((group) => (
            <motion.tbody key={`${group.key}:${page}`} initial={fade ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={springs.surface}>
              <tr>
                <th colSpan={columns.length} scope="rowgroup" className="px-3 pt-[22px] pb-2.5 text-start font-normal">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-ink">{group.title}</span>
                    {group.count === undefined ? null : <CountPill>{group.count}</CountPill>}
                    {group.meta ? <span className="text-caption text-mute">{group.meta}</span> : null}
                  </span>
                </th>
              </tr>
              {body(group.rows)}
            </motion.tbody>
          ))
        ) : (
          <motion.tbody key={page} initial={fade ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={springs.surface}>
            {body(rows ?? [])}
          </motion.tbody>
        )}
      </table>
    </div>
  );
}

function NavigatingTable<Row>({ rowHref, onRowClick, ...rest }: NavigatingTableProps<Row>) {
  const navigate = useNavigate();
  return (
    <TableView
      {...rest}
      isClickable={(row) => Boolean(rowHref(row)) || Boolean(onRowClick)}
      onActivate={(row) => {
        const href = rowHref(row);
        if (href) navigate(href);
        else onRowClick?.(row);
      }}
    />
  );
}

/**
 * A real table with column headers, cells rendered by the caller, optional group header rows,
 * row hover, a selected row, and sideways scrolling inside its card. Put it on a white card.
 * Logical alignment only, so it mirrors between Hebrew and English.
 */
export function DataTable<Row>(props: DataTableProps<Row>) {
  const { rowHref, onRowClick, pageSize, pageResetKey, className, ...rest } = props;
  const total = rest.groups ? rest.groups.reduce((sum, group) => sum + group.rows.length, 0) : (rest.rows?.length ?? 0);
  const paging = usePage(total, pageSize ?? Math.max(total, 1), pageResetKey);
  // A page the desktop reel only spins past shows its top alone, so it draws just the rows that fit on screen.
  const passing = usePassing() && total > PASSING_ROWS;
  const paged = !passing && pageSize !== undefined && total > pageSize;
  const shown = passing
    ? { ...rest, ...pageOf(rest.rows, rest.groups, 1, PASSING_ROWS) }
    : paged
      ? { ...rest, ...pageOf(rest.rows, rest.groups, paging.page, pageSize), page: paging.page, fade: paging.turned }
      : rest;
  const table = rowHref ? (
    <NavigatingTable {...shown} className={paged ? undefined : className} rowHref={rowHref} onRowClick={onRowClick} />
  ) : (
    <TableView {...shown} className={paged ? undefined : className} isClickable={() => true} onActivate={onRowClick} />
  );
  if (!paged) return table;
  return (
    <div className={className}>
      {table}
      <Pager page={paging.page} pageSize={pageSize} total={total} onChange={paging.goTo} className="mt-4" />
    </div>
  );
}

/** The rows a passing page draws: a screenful, at most. */
const PASSING_ROWS = 14;

/** The page a paged table shows: the first again when `resetKey` changes, and never past the last. */
function usePage(total: number, pageSize: number, resetKey: string | undefined) {
  const [state, setState] = useState({ resetKey, page: 1, turned: false });
  if (state.resetKey !== resetKey) setState({ resetKey, page: 1, turned: false });
  const current = state.resetKey === resetKey;
  return {
    page: current ? Math.min(state.page, Math.max(1, Math.ceil(total / pageSize))) : 1,
    turned: current && state.turned,
    goTo: (page: number) => setState({ resetKey, page, turned: true }),
  };
}

/** One page of the rows, or of the grouped rows: a group split by the page's edge shows on both pages. */
function pageOf<Row>(rows: Row[] | undefined, groups: DataRowGroup<Row>[] | undefined, page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  if (!groups) return { rows: rows?.slice(start, start + pageSize) };
  let skip = start;
  let room = pageSize;
  const shown: DataRowGroup<Row>[] = [];
  for (const group of groups) {
    if (room === 0) break;
    if (skip >= group.rows.length) {
      skip -= group.rows.length;
      continue;
    }
    const slice = group.rows.slice(skip, skip + room);
    skip = 0;
    room -= slice.length;
    shown.push({ ...group, rows: slice });
  }
  return { groups: shown };
}
