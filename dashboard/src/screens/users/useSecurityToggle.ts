import { useCopy } from "../../content/locale";
import { useUpdateSecuritySwitch } from "../../data/queries";
import type { SecuritySwitch } from "../../data/types";
import { useToast } from "../../ui/toast-context";

/**
 * Flips a security switch. The switch moves at once (the mutation is optimistic); a toast confirms the change
 * and offers undo, or says it did not go through, in which case the switch has already moved back.
 */
export function useSecurityToggle() {
  const { usersCopy } = useCopy();
  const copy = usersCopy.security;
  const toast = useToast();
  const update = useUpdateSecuritySwitch();

  return (key: SecuritySwitch, enabled: boolean, label: string) => {
    const failed = () => toast.show({ message: copy.failed, tone: "warning" });
    update.mutate(
      { key, enabled },
      {
        onSuccess: () =>
          toast.show({
            message: enabled ? copy.turnedOn(label) : copy.turnedOff(label),
            onUndo: () => update.mutate({ key, enabled: !enabled }, { onError: failed }),
          }),
        onError: failed,
      },
    );
  };
}
