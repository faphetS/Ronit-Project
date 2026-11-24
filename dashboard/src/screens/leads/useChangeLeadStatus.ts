import { useCallback } from "react";
import { useCopy } from "../../content/locale";
import { useSetLeadStatus } from "../../data/queries";
import type { Lead, SettableLeadStatus } from "../../data/types";
import { useToast } from "../../ui/toast-context";
import { statusChangeProblem } from "./leads-model";

/** Changes a lead's status, from the board or the status menu. A change that didn't go through says why in a toast. */
export function useChangeLeadStatus(): (lead: Lead, status: SettableLeadStatus) => void {
  const { leadsCopy: copy } = useCopy();
  const { mutateAsync } = useSetLeadStatus();
  const toast = useToast();
  return useCallback(
    (lead: Lead, status: SettableLeadStatus) => {
      if (lead.status === status) return;
      // The promise (not mutate's per-call callbacks) so the toast survives overlapping moves and an unmounted control.
      void mutateAsync({ id: lead.id, status }).catch((error: unknown) =>
        toast.show({ message: copy.statusChange[statusChangeProblem(error)], tone: "warning" }),
      );
    },
    [copy, mutateAsync, toast],
  );
}
