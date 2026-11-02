import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useCustomers, useGroups } from "../../data/queries";
import type { CustomerFilter } from "../../data/services";
import type { Customer } from "../../data/types";
import { now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDate, formatTime, maskPassport, maskPhone } from "../../lib/format";
import { springs } from "../../motion/springs";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { DataTable, type DataColumn } from "../../ui/DataTable";
import { Ltr } from "../../ui/Ltr";
import { Pager } from "../../ui/Pager";
import { PersonCell } from "../../ui/PersonCell";
import { EmptyState, ErrorState } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { arrivedOnWhatsappOn, calendarDay, CUSTOMER_FILTERS, fullName, groupNames, initialOf, PAGE_SIZE, passportState } from "./customer-helpers";
import { TableSkeleton } from "./Skeletons";
import { useFilterCounts } from "./useFilterCounts";
import { updateLabel } from "./when";

/** An empty cell: the board's "·", read as a word. */
function NoValue() {
  const { customersCopy: copy } = useCopy();
  return (
    <span className="text-mute">
      <span aria-hidden="true">·</span>
      <span className="sr-only">{copy.table.noValue}</span>
    </span>
  );
}

interface CustomerTableProps {
  filter: CustomerFilter;
  page: number;
  onFilterChange: (filter: CustomerFilter) => void;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Desktop: the filter chips with their counts, the customer table (passport numbers masked, expiring passports tagged), and paging. */
export function CustomerTable({ filter, page, onFilterChange, onPageChange, className }: CustomerTableProps) {
  const { customersCopy: copy, states } = useCopy();
  const { locale } = useLocale();
  const reduceMotion = useReducedMotion();
  const top = useRef<HTMLDivElement>(null);
  const list = useCustomers({ filter, page, pageSize: PAGE_SIZE });
  const groups = useGroups();
  const counts = useFilterCounts();
  const reference = now();

  const goToPage = (next: number) => {
    onPageChange(next);
    top.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  };

  const columns: DataColumn<Customer>[] = [
    {
      key: "customer",
      header: copy.table.columns.customer,
      isRowHeader: true,
      cell: (customer) => <PersonCell name={fullName(customer)} initial={initialOf(customer.firstName)} to={`/customers/${customer.id}`} />,
    },
    {
      key: "phone",
      header: copy.table.columns.phone,
      cell: (customer) => <Ltr>{maskPhone(customer.phone)}</Ltr>,
    },
    {
      key: "passport",
      header: copy.table.columns.passport,
      cell: (customer) =>
        customer.passport ? <Ltr>{maskPassport(customer.passport.number)}</Ltr> : <StatusTag tone="warning">{copy.table.missingPassport}</StatusTag>,
    },
    {
      key: "expiry",
      header: copy.table.columns.expiry,
      cell: (customer) => {
        if (!customer.passport) return <NoValue />;
        const state = passportState(customer.passport, reference);
        const date = formatDate(calendarDay(customer.passport.expiryDate), locale);
        if (state === "valid") return date;
        return (
          <span className="inline-flex items-center gap-2">
            {date}
            <StatusTag tone="warning">{state === "expired" ? copy.table.expired : copy.table.expiringSoon}</StatusTag>
          </span>
        );
      },
    },
    {
      key: "birthDate",
      header: copy.table.columns.birthDate,
      cell: (customer) => (customer.passport ? formatDate(calendarDay(customer.passport.birthDate), locale) : <NoValue />),
    },
    {
      key: "group",
      header: copy.table.columns.group,
      cell: (customer) => (customer.groupIds.length === 0 ? <NoValue /> : groupNames(customer.groupIds, groups.data).join(", ")),
    },
    {
      key: "updated",
      header: copy.table.columns.updated,
      className: "text-mute",
      cell: (customer) =>
        arrivedOnWhatsappOn(customer.passport, reference) ? (
          <StatusTag tone="registered">{copy.table.fromWhatsapp(formatTime(new Date(customer.passport.receivedAt)))}</StatusTag>
        ) : (
          updateLabel(new Date(customer.updatedAt), reference, locale, copy.when)
        ),
    },
  ];

  return (
    <Surface variant="card" aria-label={copy.table.label} className={cx("pt-[18px]", className)}>
      <div ref={top} className="mb-3.5 flex scroll-mt-4 flex-wrap items-center justify-between gap-3">
        <ChipGroup
          id="customer-filter"
          label={copy.filters.label}
          options={CUSTOMER_FILTERS.map((value) => ({ value, label: copy.filters.options[value], count: counts.byFilter[value] }))}
          value={filter}
          onChange={onFilterChange}
          onPaper
        />
        <p className="text-caption text-mute">{copy.filters.masked}</p>
      </div>
      {filter === "whatsapp-today" && counts.waitingToday > 0 ? (
        <p className="-mt-1 mb-3 text-caption text-mute">{copy.filters.waitingForReview(counts.waitingToday)}</p>
      ) : null}
      {counts.failed ? (
        <p className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 text-caption text-mute">
          {copy.filters.countsFailed}
          <TextLink size="xs" onClick={counts.retry}>
            {states.retry}
          </TextLink>
        </p>
      ) : null}
      {list.isPending ? <TableSkeleton /> : null}
      {list.isError && !list.data ? <ErrorState onRetry={() => void list.refetch()} /> : null}
      {list.data ? (
        // Dims a little while the next page or filter loads; the rows on screen stay until it arrives.
        <motion.div animate={{ opacity: list.isPlaceholderData ? 0.6 : 1 }} transition={springs.ui}>
          <DataTable
            label={copy.table.label}
            columns={columns}
            rows={list.data.items}
            rowKey={(customer) => customer.id}
            rowHref={(customer) => `/customers/${customer.id}`}
            empty={
              <EmptyState
                message={copy.table.empty}
                action={
                  filter === "all" ? undefined : (
                    <Button variant="outline" size="sm" onClick={() => onFilterChange("all")}>
                      {copy.table.showAll}
                    </Button>
                  )
                }
              />
            }
          />
          <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onChange={goToPage} className="mt-4" />
        </motion.div>
      ) : null}
    </Surface>
  );
}
