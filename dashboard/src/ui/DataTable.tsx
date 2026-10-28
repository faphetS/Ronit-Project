import { AnimatePresence, motion } from "motion/react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { useNavigate } from "react-router";
import { cx } from "../lib/cx";
import { fadeOut, springs } from "../motion/springs";
import { CountPill } from "./CountPill";

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
  /** Rows fade in and out and the rest glide into place when filters change. On by default. */
  animateRows?: boolean;
  className?: string;
}

interface TableViewProps<Row> extends Omit<DataTableProps<Row>, "rowHref" | "onRowClick"> {
  onActivate?: (row: Row) => void;
  isClickable: (row: Row) => boolean;
}

const ALIGN = { start: "text-start", center: "text-center", end: "text-end" } as const;

// A click on one of these does its own thing; the row does not follow.
const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role='button'], [role='switch']";

/** The body rows as an array, so AnimatePresence sees each row as its own child. */
function renderRows<Row>(rows: Row[], { columns, rowKey, selectedKey, onActivate, isClickable, animateRows = true }: TableViewProps<Row>): ReactElement[] {
  return rows.map((row) => {
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: fadeOut }}
        transition={springs.surface}
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
  const { label, columns, rows, groups, empty, animateRows = true, className } = props;
  const visibleGroups = groups?.filter((group) => group.rows.length > 0);
  const hasRows = visibleGroups ? visibleGroups.length > 0 : Boolean(rows?.length);
  if (!hasRows && empty) return <div className={className}>{empty}</div>;

  // Rows already on screen do not animate in; rows that filters add or remove do.
  const body = (bodyRows: Row[]) =>
    animateRows ? <AnimatePresence initial={false}>{renderRows(bodyRows, props)}</AnimatePresence> : renderRows(bodyRows, props);

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
            <tbody key={group.key}>
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
            </tbody>
          ))
        ) : (
          <tbody>{body(rows ?? [])}</tbody>
        )}
      </table>
    </div>
  );
}

function NavigatingTable<Row>({ rowHref, onRowClick, ...rest }: DataTableProps<Row> & { rowHref: (row: Row) => string | undefined }) {
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
  const { rowHref, onRowClick, ...rest } = props;
  if (rowHref) return <NavigatingTable {...rest} rowHref={rowHref} onRowClick={onRowClick} />;
  return <TableView {...rest} isClickable={() => true} onActivate={onRowClick} />;
}
