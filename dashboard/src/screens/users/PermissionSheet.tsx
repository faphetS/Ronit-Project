import { useState, type FormEvent } from "react";
import { useCopy } from "../../content/locale";
import { useChangePermission } from "../../data/queries";
import type { AccessLevel, PermissionArea, Role } from "../../data/types";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/toast-context";

const LEVELS: readonly AccessLevel[] = ["full", "view", "none"];

/** One cell of the role table: what `role` may do in `area` now. */
export interface PermissionCell {
  role: Role;
  area: PermissionArea;
  access: AccessLevel;
}

/** Changes one cell of the role table, for everyone in the role. Opens with `cell`, closes on save. */
export function PermissionSheet({ cell, onClose }: { cell: PermissionCell | null; onClose: () => void }) {
  const { usersCopy: copy } = useCopy();
  const text = copy.permissions.change;
  return (
    <Sheet
      open={cell !== null}
      onClose={onClose}
      title={cell ? text.title(copy.roles[cell.role], copy.permissions.areas[cell.area]) : ""}
      description={text.body}
    >
      {/* Keyed by the cell, so the choice starts from its current level each time it opens. */}
      {cell ? <PermissionForm key={`${cell.role}-${cell.area}`} cell={cell} onClose={onClose} /> : null}
    </Sheet>
  );
}

function PermissionForm({ cell, onClose }: { cell: PermissionCell; onClose: () => void }) {
  const { usersCopy: copy, uiCopy } = useCopy();
  const text = copy.permissions.change;
  const change = useChangePermission();
  const toast = useToast();
  const [access, setAccess] = useState<AccessLevel>(cell.access);
  const [problem, setProblem] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (access === cell.access) {
      onClose();
      return;
    }
    setProblem("");
    change.mutate(
      { role: cell.role, area: cell.area, access },
      {
        onSuccess: () => {
          toast.show({ message: text.saved(copy.roles[cell.role], copy.permissions.areas[cell.area], copy.permissions.access[access]) });
          onClose();
        },
        onError: () => setProblem(text.failed),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
      <ChipGroup
        id={`permission-${cell.role}-${cell.area}`}
        label={text.label}
        options={LEVELS.map((level) => ({ value: level, label: copy.permissions.access[level] }))}
        value={access}
        onChange={setAccess}
        onPaper
      />
      <p role="status" className="min-h-5 text-small text-status-warning">
        {problem}
      </p>
      <div className="flex gap-2.5">
        <Button type="submit" disabled={change.isPending} className="flex-1 lg:flex-none">
          {text.save}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1 lg:flex-none">
          {uiCopy.cancel}
        </Button>
      </div>
    </form>
  );
}
