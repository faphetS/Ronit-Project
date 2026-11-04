import { AnimatePresence } from "motion/react";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import { useLeadCounts, useOverview } from "../../data/queries";
import { dayAt, isoDay, now } from "../../lib/clock";
import { formatDayMonth, formatNumber } from "../../lib/format";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { SelectChip, type SelectChipOption } from "../../ui/SelectChip";
import { LeadSidePanel } from "./LeadSidePanel";
import { LeadsDayPanel } from "./LeadsDayPanel";
import { LeadsKanban } from "./LeadsKanban";
import { MondaySyncLine } from "./MondaySyncLine";
import { useSettledLeads } from "./leads-data";
import { focusLeadLink } from "./leads-model";
import { ALL, boardDay, LEAD_SERVICES, LEAD_SOURCES, toLeadFilters, useLeadsUrl, type LeadsUrlState } from "./leads-url";

/**
 * The desktop leads page: the count of open leads and when Monday was last copied; how many leads came in today,
 * or on any day picked in the panel; then those leads on a board by status, filtered by source and service.
 * A lead opens in a panel that floats over the board and stays in view while the page scrolls.
 */
export function LeadsDesktopPage({ leadId }: { leadId?: string }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const url = useLeadsUrl();
  const counts = useLeadCounts();
  const overview = useOverview();

  const filters = toLeadFilters(url.state, { status: false, search: false, day: true });
  const open = useSettledLeads(filters);
  const closed = useSettledLeads({ ...filters, status: "not-relevant" });
  const shown = open.data && closed.data ? [...open.data, ...closed.data] : undefined;
  const filtered = url.state.source !== ALL || url.state.service !== ALL;

  const openCount = counts.data ? formatNumber(counts.data.all) : copy.pending;
  const newThisWeek = overview.data ? formatNumber(overview.data.newLeadsThisWeek) : copy.pending;
  const day = boardDay(url.state.day);
  let boardTitle: string = copy.board.title.all;
  if (day) boardTitle = day === isoDay(now()) ? copy.board.title.today : copy.board.title.day(formatDayMonth(dayAt(day), locale));

  const sources: SelectChipOption<LeadsUrlState["source"]>[] = [
    { value: ALL, label: copy.filters.allSources },
    ...LEAD_SOURCES.map((source) => ({ value: source, label: copy.sources[source] })),
  ];
  const services: SelectChipOption<LeadsUrlState["service"]>[] = [
    { value: ALL, label: copy.filters.allServices },
    ...LEAD_SERVICES.map((service) => ({ value: service, label: copy.services[service] })),
  ];

  const { listHref, update } = url;
  const closePanel = useCallback(() => {
    if (!leadId) return;
    navigate(listHref);
    focusLeadLink(leadId);
  }, [leadId, listHref, navigate]);

  return (
    <ScreenFrame>
      {/* The open lead floats over the board at the end side, held in view by this sticky, zero-height row. */}
      <div className="pointer-events-none sticky top-2 z-30 -mb-[18px] h-0">
        <div className="absolute end-0 top-0 w-[400px] max-w-full">
          <AnimatePresence mode="wait" initial={false}>
            {leadId ? <LeadSidePanel key={leadId} leadId={leadId} onClose={closePanel} surface="card" className="pointer-events-auto shadow-float" /> : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-1 pt-1.5">
        <Headline title={copy.title} soft={copy.summary(openCount, newThisWeek)} size="display" />
        <MondaySyncLine />
      </div>

      <LeadsDayPanel day={url.state.day} onDay={(next) => update({ day: next })} shown={shown} filtered={filtered} />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h2 className="text-title font-medium text-ink">{boardTitle}</h2>
        <div role="group" aria-label={copy.filters.label} className="flex flex-wrap items-center gap-2">
          <SelectChip label={copy.filters.source} options={sources} value={url.state.source} onChange={(source) => update({ source })} />
          <SelectChip label={copy.filters.service} options={services} value={url.state.service} onChange={(service) => update({ service })} />
        </div>
      </div>

      <LeadsKanban open={open} closed={closed} selectedId={leadId} leadHref={url.leadHref} />
    </ScreenFrame>
  );
}
