import { AnimatePresence, motion } from "motion/react";
import { useCallback, useId } from "react";
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useCopy, useLocale } from "../../content/locale";
import { useLeadCounts } from "../../data/queries";
import type { Lead } from "../../data/types";
import { now } from "../../lib/clock";
import { formatNumber, formatRelative } from "../../lib/format";
import { fadeOut, springs } from "../../motion/springs";
import { cardVariants } from "../../motion/variants";
import { Avatar } from "../../ui/Avatar";
import { CountPill } from "../../ui/CountPill";
import { Field } from "../../ui/Field";
import { Headline } from "../../ui/Headline";
import { ListRow } from "../../ui/ListRow";
import { Ltr } from "../../ui/Ltr";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { SectionHeader } from "../../ui/SectionHeader";
import { ErrorState, Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { LeadsEmpty, StatusChips } from "./LeadsFilterBar";
import { useSearchDraft, useSettledLeads } from "./leads-data";
import { groupByService, initialOf, STATUS_TONE } from "./leads-model";
import { countActiveFilters, toLeadFilters, useLeadsUrl } from "./leads-url";

/** The phone leads list: the count, search, status chips, and the leads grouped by service. */
export function LeadsPhoneList() {
  const { leadsCopy: copy } = useCopy();
  const url = useLeadsUrl();
  const counts = useLeadCounts();
  const filters = toLeadFilters(url.state, { status: true, search: true, day: false });
  const leads = useSettledLeads(filters);

  const { update } = url;
  const commitSearch = useCallback((search: string) => update({ search }), [update]);
  const [draft, setDraft] = useSearchDraft(url.state.search, commitSearch);
  const open = counts.data ? formatNumber(counts.data.all) : copy.pending;

  let content;
  if (leads.isError)
    content = (
      <Surface variant="card" compact>
        <ErrorState onRetry={() => void leads.refetch()} />
      </Surface>
    );
  else if (!leads.data) content = <PhoneListSkeleton />;
  else if (leads.data.length === 0)
    content = (
      <Surface variant="card" compact>
        <LeadsEmpty filtered={countActiveFilters(filters) > 0} onClear={url.clearFilters} />
      </Surface>
    );
  else
    content = groupByService(leads.data).map((group) => (
      <TripSection key={group.key} title={group.service ? copy.services[group.service] : copy.noService} leads={group.leads} leadHref={url.leadHref} />
    ));

  return (
    <ScreenFrame>
      <PhoneTopBar />
      <Headline title={copy.title} soft={copy.summaryPhone(open)} size="display-2" className="mx-0.5" />
      <Field label={copy.search} icon="search" name="q" type="search" value={draft} onChange={setDraft} />
      <StatusChips value={url.state.status} onChange={(status) => update({ status })} scroll />
      {content}
    </ScreenFrame>
  );
}

interface TripSectionProps {
  title: string;
  leads: Lead[];
  leadHref: (id: string) => string;
}

/** One trip: its name and count, then its leads on a white card. */
function TripSection({ title, leads, leadHref }: TripSectionProps) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const headingId = useId();
  const reference = now();
  return (
    <motion.section variants={cardVariants} aria-labelledby={headingId} className="flex flex-col gap-2">
      <SectionHeader
        id={headingId}
        title={title}
        trailing={<CountPill label={copy.leadCount(leads.length)}>{leads.length}</CountPill>}
        flush
        className="px-1 pt-1"
      />
      <ul className="surface-card rounded-card-phone px-4 py-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          {leads.map((lead) => (
            <motion.li
              key={lead.id}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: fadeOut }}
              transition={springs.surface}
              className="border-t border-line first:border-t-0"
            >
              <ListRow
                to={leadHref(lead.id)}
                align="start"
                leading={<Avatar initial={initialOf(lead.name)} />}
                title={lead.name}
                titleEnd={<StatusTag tone={STATUS_TONE[lead.status]}>{copy.status[lead.status]}</StatusTag>}
                description={
                  <>
                    <Ltr>{lead.phone}</Ltr>
                    {copy.separator}
                    {copy.sources[lead.source]}
                  </>
                }
                note={copy.noteLine(lead.lastNote, formatRelative(new Date(lead.updatedAt), reference, locale))}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}

/** Two trips of rows, while the list loads. */
function PhoneListSkeleton() {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3.5">
      <span className="sr-only">{states.loading}</span>
      {[3, 2].map((rows, trip) => (
        <div key={trip} aria-hidden="true" className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1 pt-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-[22px] w-6" />
          </div>
          <div className="surface-card rounded-card-phone px-4 py-1.5">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
                <Skeleton className="size-[38px] shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-20" />
                  </div>
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
