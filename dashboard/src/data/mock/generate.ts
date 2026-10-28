import { addDays, dayAt, daysBetween, isoDay, today as demoToday, weekStart } from "../../lib/clock";
import { EXPIRING_WITHIN_DAYS, isOpenLead } from "../rules";
import type { Customer, Database, Lead, LeadSource, LeadStatus, Passport } from "../types";
import { ACTIVITY, CUSTOMERS, GROUP_REGISTRATIONS, GROUPS, INTAKES, LEADS, USERS } from "./fixtures";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { createRng, type Rng } from "./rng";

/** Totals from the approved design. The generator adds volume around the hand-written records to hit them. */
export const TARGETS = {
  totalLeads: 1298,
  /** New leads per week for the 8 weeks ending this week, oldest first. */
  weeklyLeads: [8, 11, 7, 12, 9, 10, 9, 14],
  /** Open pipeline: 24 leads. */
  openByStatus: { new: 6, talking: 11, "details-sent": 4, registered: 3 },
  /** This week's 14 new leads by current status. */
  thisWeekByStatus: { new: 6, talking: 5, registered: 3 },
  customers: 412,
  missingPassports: 23,
  expiringPassports: 5,
} as const;

const SOURCES: LeadSource[] = ["landing-page", "instagram", "facebook", "whatsapp", "referral"];
const ASSIGNEES = ["u-ronit", "u-shira", "u-moran", null] as const;
const OLD_NOTES = ["נרשמה לטיול", "לא רלוונטי כרגע", "ביקשה לחזור בשנה הבאה", "הגיעה מהמלצה", "השתתפה באירוע"];
const HISTORY_START = "2024-01-01";

const pad = (value: number) => String(value).padStart(2, "0");

function randomPhone(rng: Rng): string {
  return `05${rng.pick(["0", "2", "3", "4", "8"])}${String(rng.int(0, 9_999_999)).padStart(7, "0")}`;
}

/** A moment on `day` between 08:00 and `latestHour`:59, Israel time. */
function momentOn(rng: Rng, day: Date, latestHour = 20): string {
  return dayAt(isoDay(day), `${pad(rng.int(8, latestHour))}:${pad(rng.int(0, 59))}`).toISOString();
}

function generateLeads(rng: Rng, day: Date): Lead[] {
  const weeks = TARGETS.weeklyLeads.length;
  const thisWeek = weekStart(day);
  const windowStart = addDays(thisWeek, -7 * (weeks - 1));
  const weekOf = (iso: string) => Math.floor(daysBetween(windowStart, new Date(iso)) / 7);
  const leads: Lead[] = [...LEADS];
  let serial = 0;

  const add = (createdAt: string, status: LeadStatus, archived: boolean) => {
    const note = rng.pick(OLD_NOTES);
    leads.push({
      id: `l-gen-${serial}`,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      phone: randomPhone(rng),
      source: rng.pick(SOURCES),
      status,
      groupId: archived ? null : rng.pick(GROUPS).id,
      assigneeId: rng.pick(ASSIGNEES),
      createdAt,
      updatedAt: createdAt,
      lastNote: note,
      archived,
      history: [{ id: `l-gen-${serial}-e1`, at: createdAt, text: note, byUserId: null }],
    });
    serial += 1;
  };

  // This week: top up to 6 new, 5 talking and 3 registered, never later than today 14:59.
  const daysSoFar = daysBetween(thisWeek, day);
  for (const status of ["new", "talking", "registered"] as const) {
    const have = leads.filter((l) => weekOf(l.createdAt) === weeks - 1 && l.status === status).length;
    for (let i = have; i < TARGETS.thisWeekByStatus[status]; i += 1) {
      const offset = rng.int(0, daysSoFar);
      add(momentOn(rng, addDays(thisWeek, offset), offset === daysSoFar ? 14 : 20), status, false);
    }
  }

  // Earlier weeks: top up the open pipeline (talking, details sent) inside the last few weeks.
  for (const status of ["talking", "details-sent"] as const) {
    const have = leads.filter((l) => isOpenLead(l) && l.status === status).length;
    for (let i = have; i < TARGETS.openByStatus[status]; i += 1) {
      add(momentOn(rng, addDays(windowStart, rng.int(weeks - 4, weeks - 2) * 7 + rng.int(0, 6))), status, false);
    }
  }

  // Archived leads from past trips fill each week of the window to its target...
  for (let week = 0; week < weeks; week += 1) {
    const have = leads.filter((l) => weekOf(l.createdAt) === week).length;
    for (let i = have; i < TARGETS.weeklyLeads[week]; i += 1) {
      add(momentOn(rng, addDays(windowStart, week * 7 + rng.int(0, 6))), rng.chance(0.6) ? "registered" : "not-relevant", true);
    }
  }

  // ...and the rest of the history before the window.
  const historyDays = daysBetween(dayAt(HISTORY_START), windowStart) - 1;
  while (leads.length < TARGETS.totalLeads) {
    add(momentOn(rng, addDays(dayAt(HISTORY_START), rng.int(0, historyDays))), rng.chance(0.6) ? "registered" : "not-relevant", true);
  }
  return leads;
}

function makePassport(rng: Rng, expiry: Date, receivedAt: string): Passport {
  return {
    number: `${rng.int(30, 43)}${String(rng.int(0, 999_999)).padStart(6, "0")}`,
    birthDate: `${rng.int(1950, 2002)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`,
    issueDate: isoDay(addDays(expiry, -3651)),
    expiryDate: isoDay(expiry),
    nationality: "ישראלית",
    receivedVia: "monday",
    receivedAt,
    photoAvailable: true,
  };
}

function generateCustomers(rng: Rng, day: Date): Customer[] {
  const customers: Customer[] = [...CUSTOMERS];
  let serial = 0;

  const add = (groupIds: string[], passport: "valid" | "expiring" | "missing") => {
    const since = dayAt(`${rng.int(2019, 2025)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`).toISOString();
    const expiry = passport === "expiring" ? addDays(day, rng.int(30, 170)) : addDays(day, rng.int(220, 3650));
    customers.push({
      id: `c-gen-${serial}`,
      firstName: rng.pick(FIRST_NAMES),
      lastName: rng.pick(LAST_NAMES),
      phone: randomPhone(rng),
      whatsappConnected: rng.chance(0.8),
      groupIds,
      source: rng.pick(SOURCES),
      assigneeId: rng.pick(ASSIGNEES),
      since,
      updatedAt: since,
      passport: passport === "missing" ? null : makePassport(rng, expiry, since),
      notes: [],
    });
    serial += 1;
  };

  for (const group of GROUPS) {
    const have = customers.filter((c) => c.groupIds.includes(group.id)).length;
    for (let i = have; i < GROUP_REGISTRATIONS[group.id]; i += 1) add([group.id], "valid");
  }
  const missing = () => customers.filter((c) => c.passport === null).length;
  const expiring = () =>
    customers.filter((c) => c.passport !== null && daysBetween(day, new Date(c.passport.expiryDate)) <= EXPIRING_WITHIN_DAYS).length;
  while (missing() < TARGETS.missingPassports) add([], "missing");
  while (expiring() < TARGETS.expiringPassports) add([], "expiring");
  while (customers.length < TARGETS.customers) add([], "valid");
  return customers;
}

export interface GenerateOptions {
  seed?: number;
  today?: Date;
}

/** The demo database: the design's records plus seeded volume. Same seed, same data. */
export function createDatabase({ seed = 5787, today = demoToday() }: GenerateOptions = {}): Database {
  const rng = createRng(seed);
  return {
    users: USERS,
    leads: generateLeads(rng, today),
    customers: generateCustomers(rng, today),
    intakes: INTAKES,
    groups: GROUPS,
    activity: ACTIVITY,
  };
}
