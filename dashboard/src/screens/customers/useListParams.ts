import { useIsPresent } from "motion/react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import type { CustomerFilter } from "../../data/services";
import { filterFromParam, pageFromParam } from "./customer-helpers";

/**
 * The list's filter (?filter=) and page (?page=), kept in the address so back and forward restore them.
 * While the screen animates out after opening a profile, it keeps showing its own filter, not the next address's.
 */
export function useListParams() {
  const isPresent = useIsPresent();
  const [live, setParams] = useSearchParams();
  const liveQuery = live.toString();
  const [kept, setKept] = useState(liveQuery);
  if (isPresent && kept !== liveQuery) setKept(liveQuery);
  const params = new URLSearchParams(isPresent ? liveQuery : kept);

  const update = (change: (next: URLSearchParams) => void) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        change(next);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );

  return {
    filter: filterFromParam(params.get("filter")),
    page: pageFromParam(params.get("page")),
    /** Picks a chip and goes back to the first page. */
    setFilter: (filter: CustomerFilter) =>
      update((next) => {
        if (filter === "all") next.delete("filter");
        else next.set("filter", filter);
        next.delete("page");
      }),
    setPage: (page: number) =>
      update((next) => {
        if (page <= 1) next.delete("page");
        else next.set("page", String(page));
      }),
  };
}
