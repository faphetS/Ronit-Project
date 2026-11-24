import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useCopy } from "../../content/locale";
import { useCreateGroup, useUpdateGroup } from "../../data/queries";
import type { GroupInput } from "../../data/services";
import type { GroupSummary, GroupType } from "../../data/types";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/toast-context";

const TYPES: GroupType[] = ["flight", "event", "project"];

interface Draft {
  name: string;
  type: GroupType;
  startsOn: string;
  endsOn: string;
  capacity: string;
}

const draftOf = (group?: GroupSummary): Draft => ({
  name: group?.name ?? "",
  type: group?.type ?? "flight",
  startsOn: group?.startsOn ?? "",
  endsOn: group?.endsOn ?? "",
  capacity: group?.capacity ? String(group.capacity) : "",
});

/** A native date input in the form's pill look. The label shows above it, small. */
function DateField({ label, value, onChange, name }: { label: string; value: string; onChange: (value: string) => void; name: string }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="px-2 text-caption text-mute">{label}</span>
      <input
        type="date"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        dir="ltr"
        className="h-12 min-w-0 rounded-full bg-sand-light px-4 text-[15px] text-ink outline-none focus:ring-2 focus:ring-ink"
      />
    </label>
  );
}

/** The new-group and edit-group form: name, type, optional dates and places. Saving a new group opens its page. */
export function GroupSheet({ open, onClose, group }: { open: boolean; onClose: () => void; group?: GroupSummary }) {
  const { groupsCopy: copy } = useCopy();
  const text = copy.manage.sheet;
  return (
    <Sheet open={open} onClose={onClose} title={group ? text.editTitle : text.newTitle} description={text.body}>
      {/* Keyed, so each opening starts from the group's current values. */}
      {open ? <GroupForm key={group?.id ?? "new"} group={group} onClose={onClose} /> : null}
    </Sheet>
  );
}

function GroupForm({ group, onClose }: { group?: GroupSummary; onClose: () => void }) {
  const { groupsCopy: copy, uiCopy } = useCopy();
  const text = copy.manage.sheet;
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftOf(group));
  const [problem, setProblem] = useState("");
  const pending = create.isPending || update.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return setProblem(text.invalid);
    if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) return setProblem(text.badDates);
    const places = draft.capacity.trim();
    if (places && !/^\d+$/.test(places)) return setProblem(text.badCapacity);
    setProblem("");
    const input: GroupInput = {
      name,
      type: draft.type,
      startsOn: draft.startsOn || null,
      endsOn: draft.endsOn || null,
      capacity: places ? Number(places) : null,
    };
    const failed = () => setProblem(text.failed);
    if (group) {
      update.mutate(
        { id: group.id, patch: input },
        {
          onSuccess: () => {
            toast.show({ message: text.saved });
            onClose();
          },
          onError: failed,
        },
      );
      return;
    }
    create.mutate(input, {
      onSuccess: (made) => {
        onClose();
        void navigate(`/groups/${made.id}`);
      },
      onError: failed,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
      <Field label={text.name} icon="groups" name="group-name" autoComplete="off" onPaper value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
      <Segmented
        id="group-type"
        label={text.type}
        options={TYPES.map((type) => ({ value: type, label: copy.kind[type] }))}
        value={draft.type}
        onChange={(type) => setDraft({ ...draft, type })}
        className="w-full"
      />
      <div className="flex gap-3">
        <DateField name="starts-on" label={`${text.startsOn} · ${text.optional}`} value={draft.startsOn} onChange={(startsOn) => setDraft({ ...draft, startsOn })} />
        <DateField name="ends-on" label={`${text.endsOn} · ${text.optional}`} value={draft.endsOn} onChange={(endsOn) => setDraft({ ...draft, endsOn })} />
      </div>
      <Field
        label={`${text.capacity} · ${text.optional}`}
        icon="users"
        name="capacity"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        onPaper
        value={draft.capacity}
        onChange={(capacity) => setDraft({ ...draft, capacity })}
      />
      <p role="status" className="min-h-5 text-small text-status-warning">
        {problem}
      </p>
      <div className="flex gap-2.5">
        <Button type="submit" disabled={pending} className="flex-1 lg:flex-none">
          {group ? text.save : text.create}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1 lg:flex-none">
          {uiCopy.cancel}
        </Button>
      </div>
    </form>
  );
}
