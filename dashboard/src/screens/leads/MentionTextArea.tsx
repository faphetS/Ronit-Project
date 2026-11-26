import { motion } from "motion/react";
import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { useCopy } from "../../content/locale";
import { useUsers } from "../../data/queries";
import type { StaffUser } from "../../data/types";
import { cx } from "../../lib/cx";
import { springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { TextArea } from "../../ui/TextArea";
import { mentionQueryAt, suggestStaff, type MentionQuery } from "./mentions";

interface MentionTextAreaProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Someone was picked from the list: their "@<full name>" is in the text now. */
  onTag: (userId: string) => void;
  placeholder?: string;
  rows?: number;
  /** The buttons after "תיוג", like save. */
  actions: ReactNode;
  /** At the start of the buttons' row: the note's kind. */
  leading?: ReactNode;
  /** On a white card, like a sheet, rather than glass. */
  onPaper?: boolean;
  className?: string;
  /** Reaches the box itself, e.g. to focus it when a sheet opens. */
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * A note box that tags the team. "@" at the start or after a space, then up to 20 letters, lists the people with a word
 * in their name that starts with them (demo accounts never show). The arrow keys move, Enter or Tab picks, Escape
 * closes, and a click picks too; a pick puts "@<full name> " in place of what was typed. "תיוג" starts a tag at the caret.
 */
export function MentionTextArea({ label, name, value, onChange, onTag, placeholder, rows = 3, actions, leading, onPaper = false, className, ref }: MentionTextAreaProps) {
  const { leadsCopy: copy, usersCopy } = useCopy();
  const staff: StaffUser[] = (useUsers().data?.users ?? []).filter((user) => !user.demo);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => fieldRef.current as HTMLTextAreaElement, []);
  const listId = useId();
  // The tag being typed at the caret, and the start of one Escape closed: it stays closed until the text changes.
  const [typed, setTyped] = useState<MentionQuery | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  // The person picked with the arrow keys, for the query they were picked in.
  const [active, setActive] = useState({ query: "", index: 0 });
  // Where the caret goes once the text a pick (or "תיוג") changed is in the box.
  const caretAfter = useRef<number | null>(null);

  const suggestions = typed && typed.start !== dismissed ? suggestStaff(staff, typed.query) : [];
  const open = suggestions.length > 0;
  const activeIndex = open && active.query === typed?.query ? Math.min(active.index, suggestions.length - 1) : 0;
  const optionId = (index: number) => `${listId}-option-${index}`;

  useLayoutEffect(() => {
    const field = fieldRef.current;
    const caret = caretAfter.current;
    if (!field || caret === null) return;
    caretAfter.current = null;
    field.setSelectionRange(caret, caret);
  }, [value]);

  // At the foot of a lead's panel the list would open past the edge of what shows: scroll just enough to show it.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  /** Reads the tag at the caret again, after typing or a move of the caret. */
  const follow = (field: HTMLTextAreaElement) => {
    const next = mentionQueryAt(field.value, field.selectionStart);
    setTyped((current) => (current?.start === next?.start && current?.query === next?.query ? current : next));
  };

  const change = (next: string) => {
    onChange(next);
    setDismissed(null);
    if (fieldRef.current) follow(fieldRef.current);
  };

  const pick = (person: StaffUser) => {
    const field = fieldRef.current;
    if (!typed || !field) return;
    const rest = value.slice(field.selectionStart);
    const tag = `@${person.name}`;
    // One space after the name: the one already there, or a new one.
    const spaceAfter = /^\s/.test(rest);
    caretAfter.current = typed.start + tag.length + 1;
    onChange(`${value.slice(0, typed.start)}${tag}${spaceAfter ? "" : " "}${rest}`);
    onTag(person.id);
    setTyped(null);
    field.focus();
  };

  /** "תיוג": an "@" at the caret (after a space, so it starts a tag), and the list open under it. */
  const startTag = () => {
    const field = fieldRef.current;
    if (!field) return;
    const { selectionStart: start, selectionEnd: end } = field;
    const at = start > 0 && !/\s/.test(value[start - 1]) ? " @" : "@";
    caretAfter.current = start + at.length;
    onChange(`${value.slice(0, start)}${at}${value.slice(end)}`);
    setDismissed(null);
    setTyped({ start: start + at.length - 1, query: "" });
    field.focus();
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || !typed || event.nativeEvent.isComposing) return;
    const last = suggestions.length - 1;
    const moveTo = (index: number) => {
      event.preventDefault();
      setActive({ query: typed.query, index });
    };
    if (event.key === "ArrowDown") moveTo(activeIndex >= last ? 0 : activeIndex + 1);
    else if (event.key === "ArrowUp") moveTo(activeIndex <= 0 ? last : activeIndex - 1);
    else if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      // Closes the list only: the lead's panel around the box stays open.
      event.preventDefault();
      event.stopPropagation();
      setDismissed(typed.start);
    }
  };

  const list = (
    <motion.ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={copy.detail.noteTagList}
      hidden={!open}
      initial={false}
      animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
      transition={springs.ui}
      className="absolute start-0 top-full z-20 mt-1.5 flex w-full max-w-[300px] flex-col gap-0.5 rounded-[18px] bg-paper p-1.5 shadow-float ring-1 ring-black/[0.05]"
    >
      {suggestions.map((person, index) => (
        <li
          key={person.id}
          id={optionId(index)}
          role="option"
          aria-selected={index === activeIndex}
          // The box keeps the focus, so the caret stays where the tag is.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(person)}
          className={cx(
            "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-1.5 text-[14.5px] text-ink transition-colors",
            index === activeIndex ? "bg-sand" : "hover:bg-sand-light",
          )}
        >
          <Avatar initial={person.initial} size="xs" />
          <span className="min-w-0 flex-1 truncate">
            <bdi>{person.name}</bdi>
          </span>
          <span className="shrink-0 text-caption text-mute">{usersCopy.roles[person.role]}</span>
        </li>
      ))}
    </motion.ul>
  );

  return (
    <TextArea
      ref={fieldRef}
      label={label}
      name={name}
      rows={rows}
      value={value}
      onChange={change}
      onSelect={(event) => follow(event.currentTarget)}
      onKeyDown={keyDown}
      onBlur={() => setTyped(null)}
      placeholder={placeholder}
      combobox={{ expanded: open, controls: listId, activeDescendant: open ? optionId(activeIndex) : undefined }}
      popup={list}
      className={className}
      leading={leading}
      onPaper={onPaper}
      actions={
        <span className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon="at" onClick={startTag}>
            {copy.detail.noteTag}
          </Button>
          {actions}
        </span>
      }
    />
  );
}
