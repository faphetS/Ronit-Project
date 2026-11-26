import { Fragment, useState } from "react";
import { Link } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import { useAddLeadNote, useDeleteLeadNote, useEditLeadNote, useSession, useUsers } from "../../data/queries";
import type { Lead, LeadEvent, NoteCategory } from "../../data/types";
import { cx } from "../../lib/cx";
import { formatDayMonth } from "../../lib/format";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Segmented } from "../../ui/Segmented";
import { useToast } from "../../ui/toast-context";
import { useStaffLookup } from "../customers/useStaffLookup";
import { splitMentions, tagsToSave, withTag } from "./mentions";
import { MentionTextArea } from "./MentionTextArea";

/** A note's tags; a server from before tags sends none. */
const tagsOf = (event: LeadEvent): string[] => event.mentions ?? [];

/** A note's kind; a server from before kinds sends none, so it's a plain note. */
const kindOf = (event: LeadEvent): NoteCategory => event.category ?? "note";

const KINDS: readonly NoteCategory[] = ["note", "question", "answer"];

/** Questions in the copper of "in talks", still open; answers in the green of "registered", settled. */
const KIND_TONE = {
  question: "bg-status-talking/15 text-status-talking-deep",
  answer: "bg-status-registered/15 text-status-registered-deep",
} as const;

/** The label of a question or an answer, before its text. Plain notes have none. Compact fits a line of small text. */
export function NoteKindBadge({ kind, compact = false, className }: { kind: NoteCategory; compact?: boolean; className?: string }) {
  const { leadsCopy: copy } = useCopy();
  if (kind !== "question" && kind !== "answer") return null;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full font-medium whitespace-nowrap",
        compact ? "h-[18px] px-1.5 text-[11px]" : "h-[22px] px-2 text-caption",
        KIND_TONE[kind],
        className,
      )}
    >
      {copy.detail.noteKinds[kind]}
    </span>
  );
}

/** Note, question or answer: the small switch at the start of the note box's buttons. */
export function NoteKindPicker({ id, value, onChange }: { id: string; value: NoteCategory; onChange: (kind: NoteCategory) => void }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <Segmented
      id={id}
      size="sm"
      label={copy.detail.noteKind}
      value={value}
      onChange={onChange}
      options={KINDS.map((kind) => ({ value: kind, label: copy.detail.noteKinds[kind] }))}
    />
  );
}

/** The box for a new note, for people with full Leads access. "@" tags someone from the team. */
export function NoteComposer({ leadId }: { leadId: string }) {
  const { leadsCopy: copy } = useCopy();
  const toast = useToast();
  const add = useAddLeadNote();
  const team = useUsers().data?.users;
  const [text, setText] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [kind, setKind] = useState<NoteCategory>("note");
  const save = () => {
    const trimmed = text.trim();
    if (!trimmed || add.isPending) return;
    add.mutate(
      { id: leadId, text: trimmed, mentions: tagsToSave(trimmed, tagged, team), category: kind },
      {
        onSuccess: () => {
          setText("");
          setTagged([]);
          setKind("note");
          toast.show({ message: copy.detail.noteSaved });
        },
        onError: () => toast.show({ message: copy.detail.noteFailed, tone: "warning" }),
      },
    );
  };
  return (
    <MentionTextArea
      label={copy.detail.noteLabel}
      name="note"
      value={text}
      onChange={setText}
      onTag={(userId) => setTagged(withTag(userId))}
      placeholder={copy.detail.notePlaceholder}
      className="mb-4"
      leading={<NoteKindPicker id="note-kind-new" value={kind} onChange={setKind} />}
      actions={
        <Button size="sm" onClick={save} disabled={!text.trim() || add.isPending}>
          {copy.detail.noteSave}
        </Button>
      }
    />
  );
}

/**
 * A note's text, with the "@<full name>" of each person it tags as a gold chip. Other "@" text stays as it is. A question
 * or an answer starts with its label.
 */
export function NoteText({ text, mentions, kind = "note" }: { text: string; mentions: readonly string[]; kind?: NoteCategory }) {
  const team = useUsers().data?.users ?? [];
  const parts = splitMentions(
    text,
    team.filter((user) => mentions.includes(user.id)),
  );
  return (
    <p className="font-medium break-words whitespace-pre-line text-ink">
      <NoteKindBadge kind={kind} className="me-1.5" />
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <Fragment key={index}>{part}</Fragment>
        ) : (
          <bdi key={index} data-mention={part.person.id} className="rounded-md bg-gold/25 px-1 box-decoration-clone">
            {part.text}
          </bdi>
        ),
      )}
    </p>
  );
}

const LINK_BUTTON = "text-caption font-medium text-copy underline-offset-2 hover:underline";

function NoteRow({ leadId, event, canManage }: { leadId: string; event: LeadEvent; canManage: boolean }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const toast = useToast();
  const staff = useStaffLookup();
  const team = useUsers().data?.users;
  const edit = useEditLeadNote();
  const remove = useDeleteLeadNote();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(event.text);
  const [tagged, setTagged] = useState<string[]>(() => tagsOf(event));
  const [kind, setKind] = useState<NoteCategory>(() => kindOf(event));
  const [confirming, setConfirming] = useState(false);

  const date = formatDayMonth(new Date(event.at), locale);
  const isCrm = event.source === "crm";
  const who = isCrm ? (staff(event.byUserId)?.name ?? null) : event.author;
  const meta = who ? copy.detail.historyMeta(date, who) : date;

  // The editor opens on the note as it is now, with the people it tags already remembered.
  const startEdit = () => {
    setDraft(event.text);
    setTagged(tagsOf(event));
    setKind(kindOf(event));
    setEditing(true);
  };
  // The tags always go with an edit, so taking a name out of the text takes its tag off.
  const saveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || edit.isPending) return;
    edit.mutate(
      { id: leadId, noteId: event.id, text: trimmed, mentions: tagsToSave(trimmed, tagged, team), category: kind },
      { onSuccess: () => setEditing(false), onError: () => toast.show({ message: copy.detail.noteFailed, tone: "warning" }) },
    );
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(event.text);
    setTagged(tagsOf(event));
    setKind(kindOf(event));
  };
  const confirmDelete = () => {
    remove.mutate(
      { id: leadId, noteId: event.id },
      {
        onSuccess: () => toast.show({ message: copy.detail.noteDeleted }),
        onError: () => toast.show({ message: copy.detail.noteFailed, tone: "warning" }),
        onSettled: () => setConfirming(false),
      },
    );
  };

  return (
    <li className="relative ps-6 pb-4 last:pb-0">
      <span aria-hidden="true" className={`absolute start-[3px] top-[7px] size-[9px] rounded-full ${isCrm ? "bg-ink" : "bg-status-irrelevant"}`} />
      {editing ? (
        <MentionTextArea
          label={copy.detail.noteEditLabel}
          name="note-edit"
          value={draft}
          onChange={setDraft}
          onTag={(userId) => setTagged(withTag(userId))}
          leading={<NoteKindPicker id={`note-kind-${event.id}`} value={kind} onChange={setKind} />}
          actions={
            <>
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                {copy.detail.noteCancel}
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={!draft.trim() || edit.isPending}>
                {copy.detail.noteSave}
              </Button>
            </>
          }
        />
      ) : (
        <>
          <NoteText text={event.text} mentions={tagsOf(event)} kind={kindOf(event)} />
          <p className="text-caption text-mute">
            {meta}
            {event.editedAt ? ` · ${copy.detail.noteEdited}` : null}
          </p>
          {canManage ? (
            <p className="mt-1 flex gap-3">
              <button type="button" className={LINK_BUTTON} onClick={startEdit}>
                {copy.detail.noteEdit}
              </button>
              <button type="button" className={LINK_BUTTON} onClick={() => setConfirming(true)}>
                {copy.detail.noteDelete}
              </button>
            </p>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={confirming}
        title={copy.detail.noteDeleteTitle}
        description={copy.detail.noteDeleteDescription}
        confirmLabel={copy.detail.noteDeleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
        pending={remove.isPending}
      />
    </li>
  );
}

/** The notes, newest first. Edit and delete show on CRM notes the signed-in user wrote, and on all CRM notes for admins. */
export function NoteList({ lead }: { lead: Lead }) {
  const { leadsCopy: copy } = useCopy();
  const user = useSession().data?.user;
  return (
    <ol aria-label={copy.detail.history}>
      {lead.history.map((event) => (
        <NoteRow key={event.id} leadId={lead.id} event={event} canManage={event.source === "crm" && Boolean(user) && (user?.role === "admin" || user?.id === event.byUserId)} />
      ))}
    </ol>
  );
}

/** Links to the CRM groups the lead is in. */
export function GroupLinks({ lead }: { lead: Lead }) {
  const { leadsCopy: copy } = useCopy();
  const groups = lead.groups ?? [];
  if (groups.length === 0) return <p className="text-small text-mute">{copy.detail.noGroups}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {groups.map((group) => (
        <li key={group.id}>
          <Link to={`/groups/${group.id}`} className="inline-flex h-9 items-center rounded-full bg-white/60 px-4 text-small font-medium text-ink ring-1 ring-white/85 ring-inset hover:bg-white">
            <bdi>{group.name}</bdi>
          </Link>
        </li>
      ))}
    </ul>
  );
}
