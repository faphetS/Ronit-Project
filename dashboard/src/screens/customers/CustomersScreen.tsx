import { motion } from "motion/react";
import { useState } from "react";
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { useCopy } from "../../content/locale";
import { useCustomerCounts } from "../../data/queries";
import { formatNumber } from "../../lib/format";
import { cardVariants } from "../../motion/variants";
import { ChipGroup } from "../../ui/ChipGroup";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { TextLink } from "../../ui/TextLink";
import { CaptureSteps } from "./CaptureSteps";
import { CUSTOMER_FILTERS } from "./customer-helpers";
import { CustomerList } from "./CustomerList";
import { CustomerTable } from "./CustomerTable";
import { IntakeInbox, IntakeList } from "./IntakeInbox";
import { useDebouncedValue } from "./useDebouncedValue";
import { useFilterCounts } from "./useFilterCounts";
import { useListParams } from "./useListParams";

/** Desktop: the headline with the counts, the black WhatsApp inbox beside the capture steps, and the customer table. */
function DesktopCustomers() {
  const { customersCopy: copy } = useCopy();
  const { filter, page, setFilter, setPage } = useListParams();
  const counts = useCustomerCounts();
  const soft = counts.data
    ? copy.list.soft(formatNumber(counts.data.all), formatNumber(counts.data.withPassport))
    : counts.isError
      ? copy.list.softFallback
      : copy.list.pending;
  return (
    <ScreenFrame>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pt-1.5">
        <Headline title={copy.list.title} soft={soft} size="display" />
        <motion.div variants={cardVariants} className="pb-1.5">
          {/* Adding a customer has no service yet, so the action is shown but disabled. */}
          <GooButton icon="plus" disabled>
            {copy.list.newCustomer}
          </GooButton>
        </motion.div>
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <IntakeInbox className="lg:col-span-7 xl:col-span-8" />
        <CaptureSteps className="lg:col-span-5 xl:col-span-4" />
        <CustomerTable filter={filter} page={page} onFilterChange={setFilter} onPageChange={setPage} className="lg:col-span-12" />
      </div>
    </ScreenFrame>
  );
}

/** Phone: the headline, search, filter chips, today's WhatsApp passports, and the customers as a list. */
function PhoneCustomers() {
  const { customersCopy: copy, states } = useCopy();
  const { filter, page, setFilter, setPage } = useListParams();
  const counts = useCustomerCounts();
  const filterCounts = useFilterCounts();
  const [search, setSearch] = useState("");
  const settledSearch = useDebouncedValue(search.trim(), 250);
  const soft = counts.data ? copy.list.softPhone(formatNumber(counts.data.all)) : counts.isError ? copy.list.softFallback : copy.list.pending;

  const changeSearch = (value: string) => {
    setSearch(value);
    // A new search starts at the first page.
    if (page > 1) setPage(1);
  };

  return (
    <ScreenFrame>
      <PhoneTopBar />
      <Headline title={copy.list.title} soft={soft} size="display-2" className="px-0.5" />
      <motion.div variants={cardVariants}>
        <Field label={copy.search.label} icon="search" name="customer-search" type="search" value={search} onChange={changeSearch} />
      </motion.div>
      <motion.div variants={cardVariants}>
        <ChipGroup
          id="customer-filter"
          scroll
          label={copy.filters.label}
          options={CUSTOMER_FILTERS.map((value) => ({ value, label: copy.filters.optionsPhone[value], count: filterCounts.byFilter[value] }))}
          value={filter}
          onChange={setFilter}
        />
        {filterCounts.failed ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 px-1 text-caption text-mute">
            {copy.filters.countsFailed}
            <TextLink size="xs" onClick={filterCounts.retry}>
              {states.retry}
            </TextLink>
          </p>
        ) : null}
      </motion.div>
      <IntakeList />
      <CustomerList
        filter={filter}
        page={page}
        search={settledSearch}
        onFilterChange={setFilter}
        onPageChange={setPage}
        onClearSearch={() => changeSearch("")}
      />
    </ScreenFrame>
  );
}

/** Customers and passports: the WhatsApp passport inbox and the customer list. ?filter= picks a chip (the rail links to ?filter=whatsapp). */
export function CustomersScreen() {
  return useShell() === "phone" ? <PhoneCustomers /> : <DesktopCustomers />;
}
