import { AnimatePresence } from "motion/react";
import { useCallback, useId, useState } from "react";
import { useNavigate } from "react-router";
import { useCopy } from "../../content/locale";
import { useLeadCounts, useOverview } from "../../data/queries";
import { formatNumber } from "../../lib/format";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { Segmented } from "../../ui/Segmented";
import { LeadPanelHint, LeadSidePanel } from "./LeadSidePanel";
import { LeadsBoardView } from "./LeadsBoard";
import { FilterToggle, LeadsFilterBar } from "./LeadsFilterBar";
import { LeadsTableView } from "./LeadsTable";
import { MondayNotice } from "./MondayNotice";
import { focusLeadLink } from "./leads-model";
import { countActiveFilters, toLeadFilters, useLeadsUrl, type LeadsView } from "./leads-url";

/**
 * The desktop leads page, as on the Leads board: the two-tone count, the view switch, filters and "ליד חדש";
 * the Monday note; the filters row; then the table (or the board) beside the side column, which holds the open
 * lead or, before one is chosen, a short hint.
 */
export function LeadsDesktopPage({ leadId }: { leadId?: string }) {
  const { leadsCopy: copy } = useCopy();
  const navigate = useNavigate();
  const url = useLeadsUrl();
  const counts = useLeadCounts();
  const overview = useOverview();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const filtersId = useId();

  const board = url.state.view === "board";
  const filters = toLeadFilters(url.state, { status: !board, search: false });
  const activeFilters = countActiveFilters(filters);
  const open = counts.data ? formatNumber(counts.data.all) : copy.pending;
  const newThisWeek = overview.data ? formatNumber(overview.data.newLeadsThisWeek) : copy.pending;

  const { listHref, update } = url;
  const closePanel = useCallback(() => {
    if (!leadId) return;
    navigate(listHref);
    focusLeadLink(leadId);
  }, [leadId, listHref, navigate]);
  // The board has no status chips (its columns are the statuses), so the status filter goes when it opens.
  const changeView = (view: LeadsView) => update(view === "board" ? { view, status: "all" } : { view });

  const listProps = { filters, selectedId: leadId, leadHref: url.leadHref, filtered: activeFilters > 0, onClear: url.clearFilters };

  return (
    <ScreenFrame>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pt-1.5">
        <Headline title={copy.title} soft={copy.summary(open, newThisWeek)} size="display" />
        <div className="flex flex-wrap items-center gap-3 pb-1.5">
          <Segmented
            id="leads-view"
            label={copy.view.label}
            value={url.state.view}
            onChange={changeView}
            options={[
              { value: "table", label: copy.view.table },
              { value: "board", label: copy.view.board },
            ]}
          />
          <FilterToggle open={filtersOpen} controls={filtersId} activeCount={activeFilters} onToggle={() => setFiltersOpen((shown) => !shown)} />
          {/* Adding leads needs the API: there is no service for it yet. */}
          <GooButton icon="plus" disabled>
            {copy.newLead}
          </GooButton>
        </div>
      </div>

      <MondayNotice />
      <LeadsFilterBar id={filtersId} hidden={!filtersOpen} showStatus={!board} state={url.state} onChange={update} />

      <div className="grid grid-cols-12 items-start gap-5">
        <div className="col-span-7 min-w-0 xl:col-span-8">{board ? <LeadsBoardView {...listProps} /> : <LeadsTableView {...listProps} />}</div>
        <div className="sticky top-2 col-span-5 min-w-0 xl:col-span-4">
          <AnimatePresence mode="wait" initial={false}>
            {leadId ? <LeadSidePanel key={leadId} leadId={leadId} onClose={closePanel} /> : <LeadPanelHint key="hint" />}
          </AnimatePresence>
        </div>
      </div>
    </ScreenFrame>
  );
}
