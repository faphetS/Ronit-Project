import { useCopy, useLocale } from "../../content/locale";
import type { GroupSummary } from "../../data/types";
import { cx } from "../../lib/cx";
import { BigNumber } from "../../ui/BigNumber";
import { LinkCard } from "../../ui/LinkCard";
import { Meter } from "../../ui/Meter";
import { StatusTag } from "../../ui/StatusTag";
import { fillShare, groupTag, groupWhen, phoneCaption, phoneTag } from "./groups";

/** The meter inside a card link: hidden from screen readers, since the figure above says the same and would join the link's name. */
function CardMeter({ group, onDark = false }: { group: GroupSummary; onDark?: boolean }) {
  const { groupsCopy: copy } = useCopy();
  return (
    <span aria-hidden="true" className="block">
      <Meter value={fillShare(group)} label={copy.registeredOf(group.registered, group.capacity)} onDark={onDark} />
    </span>
  );
}

interface GroupCardProps {
  group: GroupSummary;
  selected: boolean;
  className?: string;
}

/** A desktop group card: kind, name, registered of places, meter and date. The selected group's card is black. */
export function GroupCard({ group, selected, className }: GroupCardProps) {
  const { groupsCopy: copy } = useCopy();
  const { locale } = useLocale();
  return (
    <LinkCard to={`/groups/${group.id}`} variant={selected ? "ink" : "card"} current={selected} className={className}>
      <span className="flex h-full flex-col gap-2.5">
        <span className="flex items-center justify-between gap-3">
          <StatusTag onDark={selected}>{groupTag(group, copy)}</StatusTag>
          {selected ? <span className="text-caption text-ink-mute">{copy.selected}</span> : null}
        </span>
        <span className={cx("mt-1.5 block text-title font-medium", selected ? "text-cream" : "text-ink")}>{group.name}</span>
        <BigNumber as="span" value={group.registered} total={group.capacity} size={52} surface={selected ? "ink" : "card"} className="mt-1.5 mb-1 block" />
        <CardMeter group={group} onDark={selected} />
        <span className={cx("text-caption", selected ? "text-ink-mute" : "text-mute")}>{groupWhen(group, copy, locale)}</span>
      </span>
    </LinkCard>
  );
}

/** The selected group on a phone: the black card at the top. */
export function SelectedGroupCard({ group }: { group: GroupSummary }) {
  const { groupsCopy: copy } = useCopy();
  const { locale } = useLocale();
  return (
    <LinkCard to={`/groups/${group.id}`} variant="ink" current compact>
      <span className="flex flex-col gap-2">
        <span className="flex items-center justify-between gap-3">
          <StatusTag onDark>{phoneTag(group, copy, locale)}</StatusTag>
          <span className="text-caption text-ink-mute">{copy.selected}</span>
        </span>
        <span className="mt-1 block text-title font-medium text-cream">{group.name}</span>
        <BigNumber as="span" value={group.registered} total={group.capacity} size={48} surface="ink" className="my-1 block" />
        <CardMeter group={group} onDark />
        <span className="text-caption text-ink-mute">{copy.registered}</span>
      </span>
    </LinkCard>
  );
}

/** One of the other groups in the phone carousel. */
export function GroupMiniCard({ group }: { group: GroupSummary }) {
  const { groupsCopy: copy } = useCopy();
  const { locale } = useLocale();
  return (
    <LinkCard to={`/groups/${group.id}`} variant="card" compact className="w-[196px] shrink-0 py-4">
      <span className="flex flex-col gap-1.5">
        <span className="text-caption text-mute">{phoneCaption(group, copy, locale)}</span>
        <span className="block font-medium text-ink">{group.shortName}</span>
        <BigNumber as="span" value={group.registered} total={group.capacity} size={32} className="mt-2 mb-1.5 block" />
        <CardMeter group={group} />
      </span>
    </LinkCard>
  );
}
