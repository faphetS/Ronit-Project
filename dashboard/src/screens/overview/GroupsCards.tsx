import { motion } from "motion/react";
import { useId } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useGroups } from "../../data/queries";
import { formatNumber } from "../../lib/format";
import { cardVariants } from "../../motion/variants";
import { BigNumber } from "../../ui/BigNumber";
import { HScroll } from "../../ui/HScroll";
import { LinkCard } from "../../ui/LinkCard";
import { Meter } from "../../ui/Meter";
import { MeterRow } from "../../ui/MeterRow";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { SHOWN, activeGroups, groupCaption, registeredShare } from "./overview-model";
import { CarouselSkeleton, MeterRowsSkeleton } from "./OverviewStates";

/** Desktop: the active groups as rows with their registration meter. Each row opens the group. */
export function GroupsCard({ className }: { className?: string }) {
  const { overview } = useCopy();
  const copy = overview.groups;
  const { locale } = useLocale();
  const groups = useGroups();
  const headingId = useId();
  const shown = groups.data ? activeGroups(groups.data).slice(0, SHOWN.groups) : [];
  return (
    <Surface variant="card" aria-labelledby={headingId} className={className}>
      <SectionHeader id={headingId} title={copy.title} trailing={<TextLink to="/groups">{copy.all}</TextLink>} />
      {groups.isPending ? <MeterRowsSkeleton rows={SHOWN.groups} /> : null}
      {groups.isError && !groups.data ? <ErrorState onRetry={() => void groups.refetch()} /> : null}
      {groups.data && shown.length === 0 ? <EmptyState message={copy.empty} /> : null}
      {shown.length > 0 ? (
        <ul>
          {shown.map((group) => {
            const registered = formatNumber(group.registered);
            const capacity = formatNumber(group.capacity);
            return (
              <MeterRow
                key={group.id}
                as="li"
                to={`/groups/${group.id}`}
                title={group.name}
                figure={<BigNumber as="span" value={group.registered} total={group.capacity} size={26} />}
                share={registeredShare(group)}
                meterLabel={copy.registered(registered, capacity)}
                caption={groupCaption(group, copy, locale, false)}
              />
            );
          })}
        </ul>
      ) : null}
    </Surface>
  );
}

/** Phones: a heading over a sideways row of group cards, as on Mobile-Home. */
export function GroupsCarousel() {
  const { overview } = useCopy();
  const copy = overview.groups;
  const { locale } = useLocale();
  const groups = useGroups();
  const headingId = useId();
  const shown = groups.data ? activeGroups(groups.data).slice(0, SHOWN.groups) : [];
  return (
    <motion.section variants={cardVariants} aria-labelledby={headingId} className="flex flex-col gap-2.5 pt-1">
      <SectionHeader id={headingId} title={copy.title} trailing={<TextLink to="/groups">{copy.all}</TextLink>} flush className="px-0.5" />
      {groups.isPending ? <CarouselSkeleton cards={SHOWN.groups} /> : null}
      {groups.isError && !groups.data ? (
        <Surface variant="card" compact>
          <ErrorState onRetry={() => void groups.refetch()} />
        </Surface>
      ) : null}
      {groups.data && shown.length === 0 ? (
        <Surface variant="card" compact>
          <EmptyState message={copy.empty} />
        </Surface>
      ) : null}
      {shown.length > 0 ? (
        <HScroll>
          {shown.map((group) => (
            <LinkCard key={group.id} to={`/groups/${group.id}`} variant="card" compact className="w-[196px] shrink-0">
              <div className="flex flex-col gap-1.5">
                <p className="text-caption text-mute">{groupCaption(group, copy, locale, true)}</p>
                <p className="font-medium text-ink">{group.shortName}</p>
                <BigNumber value={group.registered} total={group.capacity} size={32} className="mt-2 mb-1.5" />
                {/* Inside the link the meter's value would join the link's name; the figure already says it. */}
                <div aria-hidden="true">
                  <Meter value={registeredShare(group)} label={copy.registered(formatNumber(group.registered), formatNumber(group.capacity))} />
                </div>
              </div>
            </LinkCard>
          ))}
        </HScroll>
      ) : null}
    </motion.section>
  );
}
