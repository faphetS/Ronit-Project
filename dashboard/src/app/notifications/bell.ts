import { useCurrentCampaign, usePassportIntakes } from "../../data/queries";
import type { HolidayCampaign, Mention } from "../../data/types";

/** What the bell alerts to besides tags; each counts once on its badge. */
export interface BellAlerts {
  /** The names on the passports from WhatsApp that wait for a manual check. */
  passports: string[];
  /** The holiday greeting waiting for approval, or null. */
  greeting: HolidayCampaign | null;
}

/** The passports waiting for a check and the greeting waiting for approval. Nothing while they load. */
export function useBellAlerts(): BellAlerts {
  const intakes = usePassportIntakes();
  const campaign = useCurrentCampaign();
  return {
    passports: (intakes.data ?? []).filter((intake) => intake.result === "needs-review").map((intake) => intake.name),
    greeting: campaign.data?.status === "awaiting-approval" ? campaign.data : null,
  };
}

/** How many alerts the badge counts for these. */
export function alertCount({ passports, greeting }: BellAlerts): number {
  return (passports.length > 0 ? 1 : 0) + (greeting ? 1 : 0);
}

/** About this many characters of a note show under its tag. */
const EXCERPT_LENGTH = 80;

/** The opening of a note on one line: its first 80 or so characters. */
export function excerpt(text: string, length = EXCERPT_LENGTH): string {
  const line = text.replace(/\s+/g, " ").trim();
  const characters = Array.from(line);
  return characters.length > length ? `${characters.slice(0, length).join("").trimEnd()}…` : line;
}

/** Unread tags first; newest first within each, as the server sends them. */
export function unreadFirst(items: readonly Mention[]): Mention[] {
  return [...items.filter((item) => !item.seen), ...items.filter((item) => item.seen)];
}
