import { useCallback } from "react";
import { useCopy } from "../../content/locale";
import { BULK_CALLS, useSetLeadStatus } from "../../data/queries";
import type { Lead, LeadStatus, SettableLeadStatus } from "../../data/types";
import { settleEach } from "../../lib/settle";
import { useToast } from "../../ui/toast-context";
import { columnOf, STATUS_CHOICES, statusChangeProblem, type DropTarget } from "./leads-model";

/** "Details sent" comes from the office's flow, never from a menu, so a lead that had it can't be put back by hand. */
const isSettable = (status: LeadStatus): status is SettableLeadStatus => status !== "details-sent";

/**
 * Moves several leads to one column, a few calls at a time; each card moves as its call goes out. One toast says how
 * it went, with an undo when all of them moved and each can go back to the status it had. Resolves with the leads that
 * didn't move, so they can stay picked for another try.
 */
export function useMoveLeads(): (leads: readonly Lead[], target: DropTarget) => Promise<Lead[]> {
  const { leadsCopy: copy } = useCopy();
  const { mutateAsync } = useSetLeadStatus();
  const toast = useToast();
  return useCallback(
    async (leads: readonly Lead[], target: DropTarget) => {
      const column = copy.board.columns[target];
      const status = STATUS_CHOICES.find((choice) => choice.target === target)?.status;
      const moving = leads.filter((lead) => columnOf(lead.status) !== target);
      if (!status || moving.length === 0) {
        toast.show({ message: copy.select.alreadyThere(column) });
        return [];
      }
      const failures = await settleEach(moving, BULK_CALLS, (lead) => mutateAsync({ id: lead.id, status }));
      const failed = failures.map((failure) => failure.item);
      const moved = moving.filter((lead) => !failed.includes(lead));
      if (moved.length === 0) {
        toast.show({ message: copy.statusChange[statusChangeProblem(failures[0]?.error)], tone: "warning" });
      } else if (failed.length > 0) {
        toast.show({ message: copy.select.movedSome(moved.length, moving.length), tone: "warning" });
      } else {
        const undo = async () => {
          const notBack = await settleEach(moved, BULK_CALLS, (lead) => (isSettable(lead.status) ? mutateAsync({ id: lead.id, status: lead.status }) : Promise.resolve()));
          if (notBack.length > 0) toast.show({ message: copy.statusChange.failed, tone: "warning" });
        };
        toast.show({
          message: copy.select.moved(moved.length, column),
          onUndo: moved.every((lead) => isSettable(lead.status)) ? () => void undo() : undefined,
        });
      }
      return failed;
    },
    [copy, mutateAsync, toast],
  );
}
