import { AnimatePresence } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import { useCan, useLeadCounts, useOverview } from "../../data/queries";
import { dayAt, isoDay, now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber } from "../../lib/format";
import { Headline } from "../../ui/Headline";
import { Icon } from "../../ui/Icon";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { SelectChip, type SelectChipOption } from "../../ui/SelectChip";
import { LeadSidePanel } from "./LeadSidePanel";
import { LeadsDayPanel } from "./LeadsDayPanel";
import { LeadsKanban, type BoardPicking } from "./LeadsKanban";
import { LeadsSelectionBar } from "./LeadsSelectionBar";
import { NextFlight } from "./NextFlight";
import { useSettledLeads } from "./leads-data";
import { useChangeLeadStatus } from "./useChangeLeadStatus";
import { useCloseOnOutsidePress } from "./useCloseOnOutsidePress";
import { focusLeadLink } from "./leads-model";
import { TaggedMeChip } from "./LeadsFilterBar";
import type { Lead } from "../../data/types";
import { ALL, boardDay, LEAD_SERVICES, LEAD_SOURCES, TODAY, toLeadFilters, useLeadsUrl, type LeadsUrlState } from "./leads-url";

/** Picking cards on the board: on or off, and the leads picked, by id. A different board starts it over. */
function useBoardPicking(boardKey: string) {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [pickedOn, setPickedOn] = useState(boardKey);
  if (pickedOn !== boardKey) {
    setPickedOn(boardKey);
    setPicked(new Set());
  }
  const onPick = useCallback(
    (ids: readonly string[], add: boolean) =>
      setPicked((current) => {
        const next = new Set(current);
        for (const id of ids) {
          if (add) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
    [],
  );
  const keep = useCallback((ids: string[]) => setPicked(new Set(ids)), []);
  // Picking starts with nothing picked: a move that finished after "סיום" can't leave its misses picked for next time.
  const start = useCallback(() => {
    setPicked(new Set());
    setOn(true);
  }, []);
  const stop = useCallback(() => {
    setOn(false);
    setPicked(new Set());
  }, []);
  const picking: BoardPicking | undefined = on ? { picked, onPick } : undefined;
  return { on, picked, picking, keep, start, stop };
}

/** The leads on the board, each once: a lead whose status just changed can sit in both lists until they refresh. */
function onBoard(open: Lead[] | undefined, closed: Lead[] | undefined): Lead[] | undefined {
  if (!open || !closed) return undefined;
  return [...new Map([...open, ...closed].map((lead) => [lead.id, lead])).values()];
}

/**
 * The desktop leads page: the count of open leads and the next flight; how many leads came in today, or on any day
 * picked in the panel; then those leads on a board by status, filtered by source and service, or to the ones whose
 * notes tag you ("תויגתי", which looks at every day). A lead opens in a panel that floats over the board and stays in
 * view while the page scrolls; a press outside it closes it. People who may change statuses can pick several cards
 * ("בחירה") and move them all to one column or tag someone on all of them, from a bar at the bottom.
 */
export function LeadsDesktopPage({ leadId }: { leadId?: string }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const url = useLeadsUrl();
  const counts = useLeadCounts();
  const overview = useOverview();
  const canMove = useCan("leads", "full");
  const changeStatus = useChangeLeadStatus();

  const filters = toLeadFilters(url.state, { status: false, search: false, day: true });
  const open = useSettledLeads(filters);
  const closed = useSettledLeads({ ...filters, status: "not-relevant" });
  const shown = onBoard(open.data, closed.data);
  const taggedMe = url.state.tagged === "me";
  const filtered = url.state.source !== ALL || url.state.service !== ALL || taggedMe;

  const openCount = counts.data ? formatNumber(counts.data.all) : copy.pending;
  const newThisWeek = overview.data ? formatNumber(overview.data.newLeadsThisWeek) : copy.pending;
  const day = boardDay(url.state.day);
  let boardTitle: string = taggedMe ? copy.board.title.tagged : copy.board.title.all;
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
  const pick = useBoardPicking([url.state.day, url.state.source, url.state.service, url.state.tagged].join("|"));
  const picked = shown?.filter((lead) => pick.picked.has(lead.id)) ?? [];
  // The open lead's panel would cover a column of cards to pick from.
  const startPicking = () => {
    if (leadId) navigate(listHref);
    pick.start();
  };
  const closePanel = useCallback(() => {
    if (!leadId) return;
    navigate(listHref);
    focusLeadLink(leadId);
  }, [leadId, listHref, navigate]);
  // A press outside the panel closes it too, leaving the focus where the press put it.
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissPanel = useCallback(() => {
    navigate(listHref);
  }, [listHref, navigate]);
  useCloseOnOutsidePress(panelRef, dismissPanel, Boolean(leadId));

  return (
    <ScreenFrame>
      {/* The open lead floats over the board at the end side, held in view by this sticky, zero-height row. */}
      <div className="pointer-events-none sticky top-2 z-30 -mb-[18px] h-0">
        <div ref={panelRef} className="absolute end-0 top-0 w-[400px] max-w-full">
          <AnimatePresence mode="wait" initial={false}>
            {leadId ? <LeadSidePanel key={leadId} leadId={leadId} onClose={closePanel} surface="card" className="pointer-events-auto shadow-float" /> : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1 pt-1.5">
        <Headline title={copy.title} soft={copy.summary(openCount, newThisWeek)} size="display" />
        <NextFlight className="mb-1" />
      </div>

      <LeadsDayPanel day={url.state.day} onDay={(next) => update({ day: next })} shown={shown} filtered={filtered} />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h2 className="text-title font-medium text-ink">{boardTitle}</h2>
        <div role="group" aria-label={copy.filters.label} className="flex flex-wrap items-center gap-2">
          {/* Tags can be on any day's lead, so the filter opens on every day, and going back to all leads returns to today. */}
          <TaggedMeChip
            on={taggedMe}
            onChange={(on) => update(on ? { tagged: "me", day: ALL } : { tagged: ALL, ...(url.state.day === ALL ? { day: TODAY } : {}) })}
          />
          <SelectChip label={copy.filters.source} options={sources} value={url.state.source} onChange={(source) => update({ source })} />
          <SelectChip label={copy.filters.service} options={services} value={url.state.service} onChange={(service) => update({ service })} />
          {canMove ? (
            <>
              <span aria-hidden="true" className="mx-1 h-6 w-px bg-ink/10" />
              <button
                type="button"
                aria-pressed={pick.on}
                onClick={pick.on ? pick.stop : startPicking}
                className={cx(
                  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-colors lg:h-10",
                  pick.on ? "bg-ink text-cream" : "bg-white/55 text-copy ring-1 ring-white/85 ring-inset hover:bg-white",
                )}
              >
                <Icon name="check" size={16} className={pick.on ? "text-gold" : undefined} />
                {copy.select.start}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <LeadsKanban
        open={open}
        closed={closed}
        selectedId={leadId}
        leadHref={url.leadHref}
        canMove={canMove}
        onMove={changeStatus}
        picking={pick.picking}
      />
      {/* While picking, room under the board for the bar, so the columns' last cards and buttons scroll clear of it. */}
      {pick.on ? <div aria-hidden="true" className="h-16 shrink-0" /> : null}
      <AnimatePresence>{pick.on ? <LeadsSelectionBar key="picking" leads={picked} onKeep={pick.keep} onDone={pick.stop} /> : null}</AnimatePresence>
    </ScreenFrame>
  );
}
