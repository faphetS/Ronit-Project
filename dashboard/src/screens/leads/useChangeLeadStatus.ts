import { useCallback } from "react";
import { useCopy } from "../../content/locale";
import { useSetLeadStatus } from "../../data/queries";
import type { Lead, SettableLeadStatus } from "../../data/types";
import { useToast } from "../../ui/toast-context";
import { statusChangeProblem } from "./leads-model";

/** Changes a lead's status, from the board or the status menu. A change that didn't go through says why in a toast. */
export function useChangeLeadStatus(): (lead: Lead, status: SettableLeadStatus) => void {
  const { leadsCopy: copy } = useCopy();
  const { mutate } = useSetLeadStatus();
  const toast = useToast();
  return useCallback(
    (lead: Lead, status: SettableLeadStatus) => {
      if (lead.status === status) return;
      mutate(
        { id: lead.id, status },
        { onError: (error) => toast.show({ message: copy.statusChange[statusChangeProblem(error)], tone: "warning" }) },
      );
    },
    [copy, mutate, toast],
  );
}
