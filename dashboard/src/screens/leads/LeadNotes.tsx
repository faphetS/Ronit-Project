import { useState } from "react";
import { Link } from "react-router";
import { useCopy, useLocale } from "../../content/locale";
import { useAddLeadNote, useDeleteLeadNote, useEditLeadNote, useSession } from "../../data/queries";
import type { Lead, LeadEvent } from "../../data/types";
import { formatDayMonth } from "../../lib/format";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { TextArea } from "../../ui/TextArea";
import { useToast } from "../../ui/toast-context";
import { useStaffLookup } from "../customers/useStaffLookup";

/** The box for a new note, for people with full Leads access. */
export function NoteComposer({ leadId }: { leadId: string }) {
  const { leadsCopy: copy } = useCopy();
  const toast = useToast();
  const add = useAddLeadNote();
  const [text, setText] = useState("");
  const save = () => {
    const trimmed = text.trim();
    if (!trimmed || add.isPending) return;
    add.mutate(
      { id: leadId, text: trimmed },
      {
        onSuccess: () => {
          setText("");
          toast.show({ message: copy.detail.noteSaved });
        },
        onError: () => toast.show({ message: copy.detail.noteFailed, tone: "warning" }),
      },
    );
  };
  return (
    <TextArea
      label={copy.detail.noteLabel}
      name="note"
      rows={3}
      value={text}
      onChange={setText}
      placeholder={copy.detail.notePlaceholder}
      className="mb-4"
      actions={
        <Button size="sm" onClick={save} disabled={!text.trim() || add.isPending}>
          {copy.detail.noteSave}
        </Button>
      }
    />
  );
}

const LINK_BUTTON = "text-caption font-medium text-copy underline-offset-2 hover:underline";

function NoteRow({ leadId, event, canManage }: { leadId: string; event: LeadEvent; canManage: boolean }) {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const toast = useToast();
  const staff = useStaffLookup();
  const edit = useEditLeadNote();
  const remove = useDeleteLeadNote();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(event.text);
  const [confirming, setConfirming] = useState(false);

  const date = formatDayMonth(new Date(event.at), locale);
  const isCrm = event.source === "crm";
  const who = isCrm ? (staff(event.byUserId)?.name ?? null) : event.author;
  const meta = who ? copy.detail.historyMeta(date, who) : date;

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || edit.isPending) return;
    edit.mutate(
      { id: leadId, noteId: event.id, text: trimmed },
      { onSuccess: () => setEditing(false), onError: () => toast.show({ message: copy.detail.noteFailed, tone: "warning" }) },
    );
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(event.text);
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
        <TextArea
          label={copy.detail.noteEditLabel}
          name="note-edit"
          rows={3}
          value={draft}
          onChange={setDraft}
          actions={
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                {copy.detail.noteCancel}
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={!draft.trim() || edit.isPending}>
                {copy.detail.noteSave}
              </Button>
            </span>
          }
        />
      ) : (
        <>
          <p className="font-medium break-words whitespace-pre-line text-ink">{event.text}</p>
          <p className="text-caption text-mute">
            {meta}
            {event.editedAt ? ` · ${copy.detail.noteEdited}` : null}
          </p>
          {canManage ? (
            <p className="mt-1 flex gap-3">
              <button type="button" className={LINK_BUTTON} onClick={() => setEditing(true)}>
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
