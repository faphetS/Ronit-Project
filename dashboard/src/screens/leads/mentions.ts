/**
 * Tagging the team in a lead's notes: "@" and a few letters list people, a pick writes "@<full name>" into the text,
 * and a saved note highlights the names of the people it tags.
 */
import type { StaffUser } from "../../data/types";

/** At most this many people in the list under the note box. */
export const MAX_SUGGESTIONS = 6;

type Person = Pick<StaffUser, "id" | "name">;

/** The "@query" being typed where the caret is. */
export interface MentionQuery {
  /** Where its "@" is in the text. */
  start: number;
  /** What follows the "@" up to the caret. */
  query: string;
}

/** "@" at the start or after a space, then up to 20 characters without a space, up to the caret. */
const TYPED_TAG = /(?:^|\s)@(\S{0,20})$/u;

/** The tag being typed at `caret`, or null when the caret isn't in one. */
export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const match = TYPED_TAG.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length - 1, query: match[1] } : null;
}

/** The people with a word in their name that starts with `query` (everyone for ""), at most six, in the team's order. */
export function suggestStaff<T extends Pick<StaffUser, "name">>(people: readonly T[], query: string): T[] {
  const typed = query.toLocaleLowerCase();
  return people
    .filter((person) => !typed || person.name.toLocaleLowerCase().split(/\s+/).some((word) => word.startsWith(typed)))
    .slice(0, MAX_SUGGESTIONS);
}

/** A run of a note's text, or one person's "@<full name>" in it. */
export type NotePart = string | { person: Person; text: string };

const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");

/**
 * The note's text cut at each "@<full name>" of `people`, for highlighting. A tag starts the text or follows a space,
 * like a typed one, and no letter or digit runs on after the name. The longest name wins where one starts another.
 */
export function splitMentions(text: string, people: readonly Person[]): NotePart[] {
  const named = people.filter((person) => person.name.trim());
  if (named.length === 0) return [text];
  const byTag = new Map(named.map((person) => [`@${person.name}`, person]));
  const tags = [...byTag.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<!\\S)(${tags.join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const parts: NotePart[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const person = byTag.get(match[1]);
    if (!person) continue;
    if (match.index > end) parts.push(text.slice(end, match.index));
    parts.push({ person, text: match[1] });
    end = match.index + match[1].length;
  }
  if (end < text.length) parts.push(text.slice(end));
  return parts;
}

/** The ids among `ids` whose "@<full name>" is still in the text, each once, in the text's order: the tags a note saves. */
export function mentionedIds(text: string, ids: readonly string[], people: readonly Person[]): string[] {
  const found = splitMentions(
    text,
    people.filter((person) => ids.includes(person.id)),
  ).flatMap((part) => (typeof part === "string" ? [] : [part.person.id]));
  return [...new Set(found)];
}
