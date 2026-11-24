import { useState } from "react";
import { useNavigate } from "react-router";
import { useCopy } from "../../content/locale";
import { useCan, useRemoveGroup, useRemoveGroupMember } from "../../data/queries";
import type { GroupParticipant, GroupSummary } from "../../data/types";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { useToast } from "../../ui/toast-context";
import { AddLeadToGroup } from "./AddLeadToGroup";
import { GroupSheet } from "./GroupSheet";
import { fullName, plainName } from "./groups";

/** The tools on a group's page: add leads (customers and leads full), and edit or remove a group made in the CRM. */
export function GroupManage({ group }: { group: GroupSummary }) {
  const { groupsCopy: copy } = useCopy();
  const text = copy.manage;
  const canEdit = useCan("customers", "full");
  const leadsFull = useCan("leads", "full");
  const canAdd = canEdit && leadsFull;
  const remove = useRemoveGroup();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const own = canEdit && group.fromCrm;
  if (!own && !canAdd) return null;

  const confirm = () =>
    remove.mutate(group.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.show({ message: text.removed });
        void navigate("/groups");
      },
      onError: () => {
        setConfirming(false);
        toast.show({ message: text.removeFailed, tone: "warning" });
      },
    });

  return (
    <div className="flex flex-col gap-4">
      {own ? (
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" size="sm" icon="edit" onClick={() => setEditing(true)}>
            {text.edit}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            {text.remove}
          </Button>
        </div>
      ) : null}
      {canAdd ? <AddLeadToGroup groupId={group.id} /> : null}
      {own ? (
        <>
          <GroupSheet open={editing} onClose={() => setEditing(false)} group={group} />
          <ConfirmDialog
            open={confirming}
            title={text.removeTitle(plainName(group.name))}
            description={text.removeBody}
            confirmLabel={text.removeConfirm}
            pending={remove.isPending}
            onCancel={() => setConfirming(false)}
            onConfirm={confirm}
          />
        </>
      ) : null}
    </div>
  );
}

/** "הסרה" beside someone added here in the CRM: asks first, then takes her out of the group. Nothing for Monday's people. */
export function RemoveMemberButton({ group, person }: { group: GroupSummary; person: GroupParticipant }) {
  const { groupsCopy: copy } = useCopy();
  const text = copy.manage.member;
  const canEdit = useCan("customers", "full");
  const remove = useRemoveGroupMember();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  if (!canEdit || !person.addedInCrm) return null;
  const name = fullName(person);

  const confirm = () =>
    remove.mutate(
      { id: group.id, memberId: person.id },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.show({ message: text.done });
        },
        onError: () => {
          setConfirming(false);
          toast.show({ message: text.failed, tone: "warning" });
        },
      },
    );

  return (
    <>
      <button
        type="button"
        aria-label={text.remove(name)}
        onClick={() => setConfirming(true)}
        className="rounded-full px-3 py-1.5 text-caption font-medium text-mute underline-offset-2 hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-ink"
      >
        {text.short}
      </button>
      <ConfirmDialog
        open={confirming}
        title={text.title(name, plainName(group.shortName))}
        description={text.body}
        confirmLabel={text.confirm}
        pending={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </>
  );
}
