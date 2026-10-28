import { isoDay } from "../../lib/clock";
import { inAudience } from "../rules";
import type { Audience, BirthdaySettings, Customer, CustomerMessage, DeliveryFailure, DeliveryStatus, HolidayCampaign } from "../types";
import type { Rng } from "./rng";
import { birthdayIn, birthdaySlot } from "./schedule";

/** Statuses of a greeting that went out; failures are attempts, not sends. */
export const WENT_OUT: ReadonlySet<DeliveryStatus> = new Set<DeliveryStatus>(["sent", "delivered", "read"]);

const failure = (rng: Rng): DeliveryFailure => (rng.chance(0.6) ? "invalid-number" : "blocked");

/** One message per customer who was a customer when the greeting went out, read and delivered in the greeting's proportions. */
function holidayMessages(rng: Rng, customers: Customer[], campaigns: HolidayCampaign[], audiences: Audience[], skip: ReadonlySet<string>): CustomerMessage[] {
  const messages: CustomerMessage[] = [];
  for (const campaign of campaigns) {
    const audience = audiences.find((a) => a.id === campaign.audienceId);
    if (campaign.status !== "completed" || !campaign.stats || !audience) continue;
    const { sent, delivered, read } = campaign.stats;
    for (const customer of customers) {
      if (skip.has(customer.id) || customer.since > campaign.sendAt || !inAudience(customer, audience)) continue;
      const roll = rng.next() * sent;
      const status: DeliveryStatus = roll < read ? "read" : roll < delivered ? "delivered" : "failed";
      messages.push({
        id: `m-${campaign.id}-${customer.id}`,
        customerId: customer.id,
        kind: "holiday",
        holiday: campaign.holiday,
        hebrewYear: campaign.hebrewYear,
        campaignId: campaign.id,
        at: campaign.sendAt,
        status,
        failure: status === "failed" ? failure(rng) : null,
      });
    }
  }
  return messages;
}

/** Birthday greetings earlier this year, the latest first, until `target` of them went out. */
function birthdayMessages(rng: Rng, customers: Customer[], settings: BirthdaySettings, todayIso: string, target: number, skip: ReadonlySet<string>): CustomerMessage[] {
  const year = Number(todayIso.slice(0, 4));
  const due = customers
    .flatMap((customer) => {
      if (skip.has(customer.id) || !customer.passport) return [];
      const day = birthdayIn(year, customer.passport.birthDate);
      return day < todayIso && isoDay(new Date(customer.since)) <= day ? [{ customer, day }] : [];
    })
    .sort((a, b) => b.day.localeCompare(a.day));
  const messages: CustomerMessage[] = [];
  let wentOut = 0;
  for (const { customer, day } of due) {
    if (wentOut >= target) break;
    const roll = rng.next();
    const status: DeliveryStatus = roll < 0.02 ? "failed" : roll < 0.24 ? "delivered" : "read";
    if (WENT_OUT.has(status)) wentOut += 1;
    messages.push({
      id: `m-birthday-${year}-${customer.id}`,
      customerId: customer.id,
      kind: "birthday",
      holiday: null,
      hebrewYear: null,
      campaignId: null,
      at: birthdaySlot(day, settings).sendAt,
      status,
      failure: status === "failed" ? failure(rng) : null,
    });
  }
  return messages;
}

export interface MessageSources {
  customers: Customer[];
  campaigns: HolidayCampaign[];
  audiences: Audience[];
  settings: BirthdaySettings;
  /** The messages written by hand; their customers get no generated messages of the same kind. */
  handWritten: CustomerMessage[];
  today: Date;
  /** Birthday greetings that went out this year, the hand-written ones included. */
  birthdaysSentThisYear: number;
}

/** Greetings that went out to the generated customers, so every profile has a history that fits the campaigns. */
export function generateMessages(rng: Rng, { customers, campaigns, audiences, settings, handWritten, today, birthdaysSentThisYear }: MessageSources): CustomerMessage[] {
  const todayIso = isoDay(today);
  const written = (kind: CustomerMessage["kind"]) => new Set(handWritten.filter((m) => m.kind === kind).map((m) => m.customerId));
  const birthdaysWritten = handWritten.filter(
    (m) => m.kind === "birthday" && WENT_OUT.has(m.status) && isoDay(new Date(m.at)).slice(0, 4) === todayIso.slice(0, 4),
  ).length;
  return [
    ...holidayMessages(rng, customers, campaigns, audiences, written("holiday")),
    ...birthdayMessages(rng, customers, settings, todayIso, birthdaysSentThisYear - birthdaysWritten, written("birthday")),
  ];
}
