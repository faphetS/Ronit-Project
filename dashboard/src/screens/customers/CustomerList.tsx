import { motion, useReducedMotion } from "motion/react";
import { useId, useRef } from "react";
import { useCopy } from "../../content/locale";
import { useCustomers, useGroups } from "../../data/queries";
import type { CustomerFilter } from "../../data/services";
import type { Customer } from "../../data/types";
import { now } from "../../lib/clock";
import { springs } from "../../motion/springs";
import { cardVariants } from "../../motion/variants";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { ListRow } from "../../ui/ListRow";
import { Pager } from "../../ui/Pager";
import { EmptyState, ErrorState } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { fullName, groupNames, initialOf, PAGE_SIZE, passportState, yearOf } from "./customer-helpers";
import { RowsSkeleton } from "./Skeletons";
import { useFilterCounts } from "./useFilterCounts";

interface CustomerListProps {
  filter: CustomerFilter;
  page: number;
  /** The settled search text; empty for none. */
  search: string;
  onFilterChange: (filter: CustomerFilter) => void;
  onPageChange: (page: number) => void;
  onClearSearch: () => void;
}

/** Phone: the customers as link rows. A flagged passport shows as a tag where the arrow would be. */
export function CustomerList({ filter, page, search, onFilterChange, onPageChange, onClearSearch }: CustomerListProps) {
  const { customersCopy: copy } = useCopy();
  const headingId = useId();
  const reduceMotion = useReducedMotion();
  const top = useRef<HTMLDivElement>(null);
  const list = useCustomers({ filter, search: search || undefined, page, pageSize: PAGE_SIZE });
  const groups = useGroups();
  const { waitingToday } = useFilterCounts();
  const reference = now();

  const goToPage = (next: number) => {
    onPageChange(next);
    top.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  };

  const row = (customer: Customer) => {
    const state = passportState(customer.passport, reference);
    const passport = customer.passport;
    const tag =
      state === "missing" || !passport
        ? customer.mondayPassport
          ? copy.table.mondayPassport[customer.mondayPassport]
          : copy.table.missingPassport
        : state === "valid"
          ? null
          : copy.phoneList.expires(passport.expiryDate.slice(5, 7), yearOf(passport.expiryDate));
    const description = [
      groupNames(customer.groupIds, groups.data).join(", "),
      passport && !tag ? copy.phoneList.passportUntil(yearOf(passport.expiryDate)) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <ListRow
        key={customer.id}
        as="li"
        to={`/customers/${customer.id}`}
        leading={<Avatar initial={initialOf(customer.firstName)} />}
        title={fullName(customer)}
        description={description || undefined}
        trailing={tag ? <StatusTag tone={!passport && customer.mondayPassport === "yes" ? "registered" : "warning"}>{tag}</StatusTag> : undefined}
        chevron={!tag}
      />
    );
  };

  const empty = search ? (
    <EmptyState
      message={copy.search.noResults}
      action={
        <Button variant="outline" size="sm" onClick={onClearSearch}>
          {copy.search.clear}
        </Button>
      }
    />
  ) : (
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
  );

  return (
    <>
      <motion.div ref={top} variants={cardVariants} className="flex scroll-mt-4 items-center justify-between gap-3 px-1 pt-1">
        <h2 id={headingId} className="text-title font-medium text-ink">
          {copy.phoneList.headings[filter]}
        </h2>
        <span className="text-caption text-mute">{copy.filters.maskedPhone}</span>
      </motion.div>
      {filter === "whatsapp-today" && waitingToday > 0 ? (
        <motion.p variants={cardVariants} className="-mt-1.5 px-1 text-caption text-mute">
          {copy.filters.waitingForReview(waitingToday)}
        </motion.p>
      ) : null}
      <Surface variant="card" compact aria-labelledby={headingId} className="px-4 py-1.5">
        {list.isPending ? <RowsSkeleton rows={5} /> : null}
        {list.isError && !list.data ? <ErrorState onRetry={() => void list.refetch()} /> : null}
        {list.data && list.data.items.length === 0 ? empty : null}
        {list.data && list.data.items.length > 0 ? (
          <motion.ul animate={{ opacity: list.isPlaceholderData ? 0.6 : 1 }} transition={springs.ui}>
            {list.data.items.map(row)}
          </motion.ul>
        ) : null}
      </Surface>
      {list.data ? <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onChange={goToPage} className="px-1" /> : null}
    </>
  );
}
