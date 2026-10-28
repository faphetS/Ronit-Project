import { useCustomerCounts, usePassportIntakes } from "../../data/queries";
import type { CustomerFilter } from "../../data/services";
import { now } from "../../lib/clock";
import { intakesOn } from "./customer-helpers";

/**
 * The numbers on the filter chips. The WhatsApp chip counts today's WhatsApp passports, as the board does (3),
 * including the ones still waiting for a review, which have no card in the list yet.
 */
export function useFilterCounts() {
  const counts = useCustomerCounts();
  const intakes = usePassportIntakes();
  const today = intakes.data ? intakesOn(intakes.data, now()) : undefined;
  const byFilter: Record<CustomerFilter, number | undefined> = {
    all: counts.data?.all,
    "whatsapp-today": today?.length,
    expiring: counts.data?.expiring,
    "missing-passport": counts.data?.["missing-passport"],
  };
  return {
    byFilter,
    /** Today's WhatsApp passports without a card (waiting for a review). */
    waitingToday: today?.filter((intake) => intake.customerId === null).length ?? 0,
    failed: counts.isError,
    retry: () => void counts.refetch(),
  };
}
