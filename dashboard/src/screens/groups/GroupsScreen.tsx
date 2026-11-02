import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useParams } from "react-router";
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { useCopy } from "../../content/locale";
import { useGroups } from "../../data/queries";
import type { GroupSummary } from "../../data/types";
import { cardVariants } from "../../motion/variants";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { HScroll } from "../../ui/HScroll";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { EmptyState, ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { GroupCard, GroupMiniCard, SelectedGroupCard } from "./GroupCards";
import { EventDateCard, EventDetailsCard, FlightCard, MissingPassportsCard, ParticipantsCard, ParticipantsList, ReadinessCard } from "./GroupDetails";
import { MISSING_SECTION, PARTICIPANTS_SECTION, revealSection, selectGroup, totalRegistered, visibleGroups } from "./groups";
import { DesktopGroupsSkeleton, PhoneGroupsSkeleton } from "./GroupsSkeleton";

interface GroupsViewProps {
  groups: GroupSummary[];
  /** Undefined when the address names a group that does not exist. */
  selected: GroupSummary | undefined;
}

/** The address named a group that is not in the list. */
function NotFound({ phone, className }: { phone: boolean; className?: string }) {
  const { groupsCopy: copy } = useCopy();
  return (
    <Surface variant="glass" compact={phone} aria-label={copy.notFound} className={className}>
      <EmptyState message={copy.notFound} action={<TextLink to="/groups">{copy.allGroups}</TextLink>} />
    </Surface>
  );
}

/** Desktop: the four group cards, then the participants beside readiness (or the event's date) and the travel details. */
function DesktopGroups({ groups, selected }: GroupsViewProps) {
  const { groupsCopy: copy } = useCopy();
  const smooth = !useReducedMotion();
  const showParticipants = () => revealSection(PARTICIPANTS_SECTION, smooth);
  const flight = selected?.type === "flight";
  const note = !selected ? null : flight ? (selected.missingPassports > 0 ? copy.readiness.note : null) : copy.event.note;
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {groups.map((group) => (
        <GroupCard key={group.id} group={group} selected={group.id === selected?.id} className="lg:col-span-6 xl:col-span-3" />
      ))}
      {selected ? (
        <>
          <ParticipantsCard group={selected} className="lg:col-span-12 xl:col-span-8" />
          <div className="grid content-start gap-5 lg:col-span-12 lg:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
            <div className="flex flex-col gap-5">
              {flight ? (
                <ReadinessCard group={selected} phone={false} onShow={showParticipants} />
              ) : (
                <EventDateCard group={selected} phone={false} onShow={showParticipants} />
              )}
              {note ? (
                <motion.p variants={cardVariants} className="px-2 text-caption text-mute">
                  {note}
                </motion.p>
              ) : null}
            </div>
            {flight ? <FlightCard flight={selected.flight} phone={false} /> : <EventDetailsCard group={selected} phone={false} />}
          </div>
        </>
      ) : (
        <NotFound phone={false} className="lg:col-span-12" />
      )}
    </div>
  );
}

/** Phones: the selected group in black, the others in a carousel, then readiness and who is missing a passport (or the event's date and participants). */
function PhoneGroups({ groups, selected }: GroupsViewProps) {
  const { groupsCopy: copy } = useCopy();
  const smooth = !useReducedMotion();
  const others = groups.filter((group) => group.id !== selected?.id);
  return (
    <>
      {selected ? <SelectedGroupCard group={selected} /> : <NotFound phone />}
      {others.length > 0 ? (
        <HScroll label={copy.otherGroups}>
          {others.map((group) => (
            <GroupMiniCard key={group.id} group={group} />
          ))}
        </HScroll>
      ) : null}
      {selected?.type === "flight" ? (
        <>
          <ReadinessCard group={selected} phone onShow={() => revealSection(MISSING_SECTION, smooth)} />
          <MissingPassportsCard group={selected} />
          <FlightCard flight={selected.flight} phone />
        </>
      ) : null}
      {selected?.type === "event" ? (
        <>
          <EventDateCard group={selected} phone onShow={() => revealSection(PARTICIPANTS_SECTION, smooth)} />
          <ParticipantsList key={selected.id} group={selected} />
          <EventDetailsCard group={selected} phone />
        </>
      ) : null}
    </>
  );
}

/** Groups and flights: group cards, participants and passports, readiness and flight details. */
export function GroupsScreen() {
  const { groupId } = useParams();
  const phone = useShell() === "phone";
  const { groupsCopy: copy } = useCopy();
  const query = useGroups();
  const groups = query.data ? visibleGroups(query.data, groupId) : undefined;
  const selected = groups ? selectGroup(groups, groupId) : undefined;
  const registered = groups ? totalRegistered(groups) : 0;
  const soft = !groups ? copy.pending : phone ? copy.softPhone(registered) : copy.soft(groups.length, registered);

  let body: ReactNode;
  if (groups && groups.length > 0) {
    body = phone ? <PhoneGroups groups={groups} selected={selected} /> : <DesktopGroups groups={groups} selected={selected} />;
  } else if (groups) {
    body = (
      <Surface variant="glass" compact={phone} aria-label={copy.cards}>
        <EmptyState message={copy.empty} />
      </Surface>
    );
  } else if (query.isError) {
    body = (
      <Surface variant="card" compact={phone} aria-label={copy.cards}>
        <ErrorState onRetry={() => void query.refetch()} />
      </Surface>
    );
  } else {
    body = phone ? <PhoneGroupsSkeleton /> : <DesktopGroupsSkeleton />;
  }

  return (
    <ScreenFrame>
      {phone ? <PhoneTopBar /> : null}
      {phone ? (
        <Headline title={copy.title} soft={soft} size="display-2" />
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <Headline title={copy.title} soft={soft} size="display" />
          <div className="pb-1.5">
            <GooButton icon="plus" disabled>
              {copy.newGroup}
            </GooButton>
          </div>
        </div>
      )}
      {body}
    </ScreenFrame>
  );
}
