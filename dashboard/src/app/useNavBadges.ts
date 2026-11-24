import { useMentions, useOverview, usePassportIntakes } from "../data/queries";
import { isoDay, now } from "../lib/clock";
import { alertCount, useBellAlerts } from "./notifications/bell";

export interface NavBadges {
  /** New leads this week, on the leads menu item. */
  newLeads: number;
  /** Passports that arrived on WhatsApp today, on the rail. */
  passportsToday: number;
  /** Items on the bell: passports waiting for review, a greeting waiting for approval, and unread tags in notes. */
  notifications: number;
}

/** Counts for the menu, the rail and the bell. Zero while loading. */
export function useNavBadges(): NavBadges {
  const overview = useOverview();
  const intakes = usePassportIntakes();
  const alerts = useBellAlerts();
  const mentions = useMentions();
  const today = isoDay(now());
  return {
    newLeads: overview.data?.newLeadsThisWeek ?? 0,
    passportsToday: (intakes.data ?? []).filter((intake) => isoDay(new Date(intake.receivedAt)) === today).length,
    notifications: alertCount(alerts) + (mentions.data?.unread ?? 0),
  };
}
