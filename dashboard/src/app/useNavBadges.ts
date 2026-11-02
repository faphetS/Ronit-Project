import { useCurrentCampaign, useOverview, usePassportIntakes } from "../data/queries";
import { isoDay, now } from "../lib/clock";

export interface NavBadges {
  /** New leads this week, on the leads menu item. */
  newLeads: number;
  /** Passports that arrived on WhatsApp today, on the rail. */
  passportsToday: number;
  /** Items on the bell: passports waiting for review, and greetings waiting for approval. */
  notifications: number;
}

/** Counts for the menu, the rail and the bell. Zero while loading. */
export function useNavBadges(): NavBadges {
  const overview = useOverview();
  const intakes = usePassportIntakes();
  const campaign = useCurrentCampaign();
  const today = isoDay(now());
  const allIntakes = intakes.data ?? [];
  const passportsWaiting = allIntakes.some((intake) => intake.result === "needs-review") ? 1 : 0;
  const greetingsWaiting = campaign.data?.status === "awaiting-approval" ? 1 : 0;
  return {
    newLeads: overview.data?.newLeadsThisWeek ?? 0,
    passportsToday: allIntakes.filter((intake) => isoDay(new Date(intake.receivedAt)) === today).length,
    notifications: passportsWaiting + greetingsWaiting,
  };
}
