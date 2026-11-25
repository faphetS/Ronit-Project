import { useMemo } from "react";
import { useCopy } from "../../content/locale";
import { useSession, useUsers } from "../../data/queries";
import type { UserAccount } from "../../data/types";
import { cx } from "../../lib/cx";
import { Avatar } from "../../ui/Avatar";

/** How many faces show before the rest are counted. */
const FACES = 3;

/** The team members behind tagged ids, in the same order. People no longer on the team drop out. */
function useTeamMembers(ids: readonly string[]): UserAccount[] {
  const users = useUsers();
  return useMemo(() => {
    const team = new Map((users.data?.users ?? []).map((user) => [user.id, user]));
    return ids.flatMap((id) => team.get(id) ?? []);
  }, [ids, users.data]);
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

interface TaggedPeopleProps {
  /** Tagged staff ids, the most recently tagged first (Lead.tagged). */
  ids: readonly string[];
  /** The first names beside the faces; phones' rows show the faces only. */
  names?: boolean;
  className?: string;
}

/**
 * Who a lead's notes tag: their faces overlapping, the signed-in person's in gold, then the first names (two at
 * most, or the first and "+N"). Screen readers hear every full name. Nothing until the team has loaded.
 */
export function TaggedPeople({ ids, names = true, className }: TaggedPeopleProps) {
  const { leadsCopy: copy } = useCopy();
  const meId = useSession().data?.user.id;
  const people = useTeamMembers(ids);
  if (people.length === 0) return null;
  const label = people.length <= 2 ? people.map((person) => firstName(person.name)).join(", ") : `${firstName(people[0].name)} +${people.length - 1}`;
  return (
    <span className={cx("flex min-w-0 items-center gap-1.5", className)}>
      <span className="sr-only">{copy.board.tagged(people.map((person) => person.name).join(", "))}</span>
      <span aria-hidden="true" className="flex shrink-0">
        {people.slice(0, FACES).map((person, index) => (
          <Avatar key={person.id} initial={person.initial} size="xs" gold={person.id === meId} className={cx("ring-2 ring-paper", index > 0 && "-ms-2")} />
        ))}
      </span>
      {names ? (
        <span aria-hidden="true" className="truncate text-caption font-medium text-copy">
          {label}
        </span>
      ) : null}
    </span>
  );
}
