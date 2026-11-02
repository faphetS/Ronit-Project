import { daysBetween, isoDay } from "../../lib/clock";
import { EXPIRING_WITHIN_DAYS, inAudience } from "../rules";
import { NotFoundError, type CustomerCounts, type CustomerFilter, type CustomerQuery, type CustomersService } from "../services";
import type { AuditEntry, Customer, CustomerMessage, HolidayCampaign, PassportAccessEntry } from "../types";
import { fullName, latestFirst, newestFirst, type MockContext } from "./context";

const FILTERS: CustomerFilter[] = ["all", "whatsapp-today", "expiring", "missing-passport"];

/** Greetings that are written but not out yet. Each customer in the audience has one waiting. */
const PENDING: ReadonlySet<HolidayCampaign["status"]> = new Set(["awaiting-approval", "scheduled", "sending"]);

function isPassportEntry(entry: AuditEntry): entry is PassportAccessEntry {
  return "customerId" in entry;
}

function customerMatches(customer: Customer, query: CustomerQuery, reference: Date): boolean {
  const filter = query.filter ?? "all";
  const passport = customer.passport;
  if (filter === "whatsapp-today" && !(passport?.receivedVia === "whatsapp" && isoDay(new Date(passport.receivedAt)) === isoDay(reference))) return false;
  if (filter === "expiring" && !(passport !== null && daysBetween(reference, new Date(passport.expiryDate)) <= EXPIRING_WITHIN_DAYS)) return false;
  if (filter === "missing-passport" && passport !== null) return false;
  const term = query.search?.trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    const byName = `${customer.firstName} ${customer.lastName}`.includes(term);
    const byNumber = digits.length > 0 && (customer.phone.includes(digits) || (passport?.number.includes(digits) ?? false));
    if (!byName && !byNumber) return false;
  }
  return true;
}

export function createCustomersMock({ state, respond, clock, actingUserId, logAudit }: MockContext): CustomersService {
  function findCustomer(id: string): Customer {
    const customer = state.customers.find((c) => c.id === id);
    if (!customer) throw new NotFoundError("Customer", id);
    return customer;
  }

  /** The holiday greeting waiting for this customer, as its campaign stands now. */
  function pendingGreetings(customer: Customer): CustomerMessage[] {
    return state.campaigns
      .filter((campaign) => PENDING.has(campaign.status))
      .filter((campaign) => {
        const audience = state.audiences.find((a) => a.id === campaign.audienceId);
        return audience !== undefined && inAudience(customer, audience);
      })
      .map((campaign) => ({
        id: `m-${campaign.id}-${customer.id}`,
        customerId: customer.id,
        kind: "holiday",
        holiday: campaign.holiday,
        hebrewYear: campaign.hebrewYear,
        campaignId: campaign.id,
        at: campaign.sendAt,
        status: campaign.status === "awaiting-approval" ? "awaiting-approval" : "scheduled",
        failure: null,
      }));
  }

  return {
    list: (query = {}) =>
      respond("customers", () => {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 25;
        const reference = clock();
        const matches = state.customers
          .filter((customer) => customerMatches(customer, query, reference))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return { items: matches.slice((page - 1) * pageSize, page * pageSize), total: matches.length, page, pageSize };
      }),
    get: (id) => respond("customers", () => findCustomer(id)),
    intakes: () => respond("customers", () => [...state.intakes].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))),
    counts: () =>
      respond("customers", () => {
        const reference = clock();
        const counts = Object.fromEntries(
          FILTERS.map((filter) => [filter, state.customers.filter((customer) => customerMatches(customer, { filter }, reference)).length]),
        ) as Record<CustomerFilter, number>;
        const result: CustomerCounts = { ...counts, withPassport: state.customers.filter((customer) => customer.passport !== null).length };
        return result;
      }),
    messages: (id) =>
      respond("customers", () => {
        const customer = findCustomer(id);
        return [...pendingGreetings(customer), ...state.messages.filter((message) => message.customerId === id)].sort(newestFirst);
      }),
    accessLog: (id) =>
      respond("customers", () => {
        const customer = findCustomer(id);
        // The passport's arrival is read off the passport itself, and comes before anything done with it.
        const received: PassportAccessEntry[] = customer.passport
          ? [{
              id: `${id}-passport-received`,
              at: customer.passport.receivedAt,
              byUserId: null,
              action: "passport-received",
              customerId: id,
              customerName: fullName(customer),
              via: customer.passport.receivedVia,
            }]
          : [];
        return latestFirst([...received, ...state.audit.filter(isPassportEntry).filter((entry) => entry.customerId === id)]);
      }),
    addNote: (id, text) =>
      respond("customers", () => {
        if (!text.trim()) throw new Error("empty-note");
        const customer = findCustomer(id);
        const at = clock().toISOString();
        customer.notes = [{ id: `${id}-n${customer.notes.length + 1}`, at, text, byUserId: actingUserId() }, ...customer.notes];
        customer.updatedAt = at;
        return customer;
      }),
    logPassportView: (id, part) =>
      respond("customers", () => {
        const customer = findCustomer(id);
        if (!customer.passport) throw new NotFoundError("Passport of customer", id);
        if (!state.security.passportAccessLog) return null;
        return logAudit({ action: part === "photo" ? "passport-photo-view" : "passport-view", customerId: id, customerName: fullName(customer) });
      }),
  };
}
