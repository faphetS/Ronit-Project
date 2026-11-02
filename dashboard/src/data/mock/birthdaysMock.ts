import { addDays, dayAt, daysBetween, isoDay } from "../../lib/clock";
import type { BirthdaysService } from "../services";
import type { BirthdayEntry, Customer, CustomerMessage, Passport } from "../types";
import { newestFirst, type MockContext } from "./context";
import { WENT_OUT } from "./generateMessages";
import { birthdayIn, birthdaySlot } from "./schedule";

/** How many sends "recent" lists. */
const RECENT_SENDS = 5;
const UPCOMING_DAYS = 7;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

type WithPassport = Customer & { passport: Passport };

const yearOf = (day: string) => Number(day.slice(0, 4));

export function createBirthdaysMock({ state, respond, clock }: MockContext): BirthdaysService {
  /** The stored greeting for a birthday: sent that day, or on the Friday before. */
  function sendFor(customerId: string, day: string): CustomerMessage | undefined {
    return state.messages.find(
      (m) => m.kind === "birthday" && m.customerId === customerId && [0, 1].includes(daysBetween(new Date(m.at), dayAt(day))),
    );
  }

  function entry(customer: WithPassport, day: string): BirthdayEntry {
    const settings = state.birthdaySettings;
    const slot = birthdaySlot(day, settings);
    const sent = sendFor(customer.id, day);
    return {
      customerId: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      day,
      age: yearOf(day) - yearOf(customer.passport.birthDate),
      sendAt: sent?.at ?? slot.sendAt,
      onShabbat: slot.onShabbat,
      status: sent?.status ?? (settings.enabled ? "scheduled" : "paused"),
      failure: sent?.failure ?? null,
    };
  }

  return {
    settings: () => respond("birthdays", () => state.birthdaySettings),
    overview: () =>
      respond("birthdays", () => {
        const reference = clock();
        const todayIso = isoDay(reference);
        const people = state.customers.filter((c): c is WithPassport => c.passport !== null);
        const on = (day: string) => people.filter((c) => birthdayIn(yearOf(day), c.passport.birthDate) === day).map((c) => entry(c, day));
        const sends = state.messages
          .filter((m) => m.kind === "birthday" && (WENT_OUT.has(m.status) || m.status === "failed") && m.at <= reference.toISOString())
          .sort(newestFirst);
        const recent: BirthdayEntry[] = [];
        for (const send of sends) {
          if (recent.length === RECENT_SENDS) break;
          const customer = people.find((c) => c.id === send.customerId);
          if (customer) recent.push(entry(customer, birthdayIn(yearOf(isoDay(new Date(send.at))), customer.passport.birthDate)));
        }
        return {
          today: on(todayIso),
          upcoming: Array.from({ length: UPCOMING_DAYS }, (_, index) => isoDay(addDays(reference, index + 1))).flatMap(on),
          recent,
          sentThisYear: sends.filter((m) => WENT_OUT.has(m.status) && isoDay(new Date(m.at)).slice(0, 4) === todayIso.slice(0, 4)).length,
        };
      }),
    updateSettings: (patch) =>
      respond("birthdays", () => {
        const settings = state.birthdaySettings;
        if (patch.sendTime !== undefined && !HH_MM.test(patch.sendTime)) throw new Error("invalid-send-time");
        if (patch.template !== undefined && !patch.template.trim()) throw new Error("empty-template");
        if (patch.enabled !== undefined) settings.enabled = patch.enabled;
        if (patch.sendTime !== undefined) settings.sendTime = patch.sendTime;
        if (patch.shabbatRule !== undefined) settings.shabbatRule = patch.shabbatRule;
        if (patch.template !== undefined) {
          settings.template = patch.template;
          settings.templateUpdatedAt = clock().toISOString();
        }
        return settings;
      }),
  };
}
