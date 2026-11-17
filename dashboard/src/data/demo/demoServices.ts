/**
 * The sample data a demo account sees (createServices switches to it while one is signed in): the test services'
 * fixed records, plus made-up leads spread over the last five weeks, customers on a made-up trip and challah months
 * around today. Every name, number and booking is invented; none comes from Ronit's data. Changes stay in the tab
 * and are gone on refresh.
 */
import { createTestServices } from "../../test/services";
import { addDays, dayAt, isoDay, monthDays, shiftMonth } from "../../lib/clock";
import { formatMonthYear } from "../../lib/format";
import { NotFoundError, type LeadCounts, type LeadFilters, type Services } from "../services";
import type { Customer, GroupParticipant, GroupSummary, Lead, LeadSource, LeadStatus, Passport } from "../types";

/** Everything but the session, which stays on the API. */
export type DataServices = Omit<Services, "session">;

/** Leads per day, oldest first, ending today. */
const PER_DAY = [2, 1, 0, 3, 4, 2, 5, 3, 1, 0, 4, 6, 3, 2, 5, 2, 0, 3, 4, 7, 5, 3, 1, 0, 4, 5, 2, 6, 7, 9, 14, 3, 2, 8, 2];
const NAMES = [
  "שירה כהן", "מיכל אברהם", "נועה ביטון", "רבקה שטרן", "יעל דהן", "אסתר מזרחי", "חנה פרץ", "דבורה אזולאי", "לאה גבאי", "תמר שפירא",
  "אורית חדד", "רחל אוחיון", "מירב סויסה", "מאיה לוי", "הדס כץ", "אפרת ששון", "ליאת בן דוד", "שרית אלון", "גלית רוזן", "נעמה פישר",
];
const SOURCES: LeadSource[] = ["facebook", "instagram", "facebook", "landing-page", "instagram", "referral"];
const GROUP: Record<LeadStatus, string> = {
  new: "לידים חדשים",
  talking: "פולואפ",
  "details-sent": "פולואפ",
  "no-answer": "אין מענה",
  registered: "נסגרו",
  "not-relevant": "לא רלוונטי",
};
const NOTE: Record<LeadStatus, string> = {
  new: "מילאה את טופס חנוכה",
  talking: "ביקשה שיחזרו אליה אחרי 16:00",
  "details-sent": "נשלחו פרטי הטיסה בוואטסאפ",
  "no-answer": "לא ענתה, לנסות שוב מחר",
  registered: "נרשמה לטיסת חנוכה",
  "not-relevant": "התאריכים לא מתאימים לה",
};

function statusFor(age: number, index: number): LeadStatus {
  if (age <= 1) return index % 3 === 2 ? "talking" : "new";
  if (age <= 7) return (["talking", "new", "no-answer", "details-sent", "no-answer"] as const)[index % 5];
  return (["registered", "details-sent", "not-relevant", "no-answer", "talking", "not-relevant"] as const)[index % 6];
}

function buildLeads(): Lead[] {
  const today = isoDay(new Date());
  const leads: Lead[] = [];
  PER_DAY.forEach((count, offset) => {
    const age = PER_DAY.length - 1 - offset;
    const day = isoDay(addDays(dayAt(today), -age));
    for (let index = 0; index < count; index += 1) {
      const status = statusFor(age, index);
      const at = dayAt(day, `${String(9 + (index % 9)).padStart(2, "0")}:${String((index * 17) % 60).padStart(2, "0")}`).toISOString();
      leads.push({
        id: `demo-${leads.length}`,
        name: NAMES[(offset * 5 + index * 3) % NAMES.length],
        phone: `05${(offset + index) % 9}${String(1_000_000 + ((offset * 7919 + index * 104_729) % 9_000_000)).slice(0, 7)}`,
        source: SOURCES[(offset * 3 + index) % SOURCES.length],
        status,
        service: (offset + index) % 5 === 0 ? "challah" : "uman",
        groupId: null,
        assigneeId: null,
        mondayBoard: "רונית  - CRM",
        mondayGroup: GROUP[status],
        mondayUrl: "https://example.monday.com/boards/1/pulses/1",
        createdAt: at,
        updatedAt: at,
        lastNote: NOTE[status],
        archived: false,
        calls: status === "no-answer" ? 1 + (index % 3) : status === "new" ? 0 : 1,
        lastCallOn: status === "new" ? null : day,
        inquiryOn: day,
        lastMessage: null,
        nextStep: null,
        history: [],
      });
    }
  });
  return leads;
}

function createDemoLeads(): Services["leads"] {
  const all = buildLeads();
  const arrived = (lead: Lead) => lead.inquiryOn ?? isoDay(new Date(lead.createdAt));
  return {
    list: async (filters: LeadFilters = {}) => {
      const term = filters.search?.trim() ?? "";
      const digits = term.replace(/\D/g, "");
      return all
        .filter((lead) => (filters.day ? arrived(lead) === filters.day : term ? true : !lead.archived))
        .filter((lead) => (!filters.status || filters.status === "all" ? lead.status !== "not-relevant" : lead.status === filters.status))
        .filter((lead) => !filters.source || lead.source === filters.source)
        .filter((lead) => !filters.service || lead.service === filters.service)
        .filter((lead) => !term || lead.name.includes(term) || (digits.length > 0 && lead.phone.includes(digits)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    counts: async () => {
      const counts: LeadCounts = { all: 0, new: 0, "no-answer": 0, talking: 0, "details-sent": 0, registered: 0, "not-relevant": 0 };
      for (const lead of all) {
        if (lead.archived) continue;
        counts[lead.status] += 1;
        if (lead.status !== "not-relevant") counts.all += 1;
      }
      return counts;
    },
    days: async () => {
      const tally = new Map<string, number>();
      for (const lead of all) tally.set(arrived(lead), (tally.get(arrived(lead)) ?? 0) + 1);
      return [...tally.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
    },
    get: async (id) => {
      const lead = all.find((entry) => entry.id === id);
      if (!lead) throw new NotFoundError("Lead", id);
      return {
        ...lead,
        history: [{ id: `${id}-note`, at: lead.updatedAt, text: lead.lastNote, byUserId: null, author: "צוות המשרד", mondayBoard: lead.mondayBoard }],
      };
    },
  };
}

/** Made-up customers on one made-up trip, so the customer and group screens have people to show. */
const PEOPLE = [
  ["שרה", "כהן"], ["לאה", "ברגר"], ["פנינה", "לוי"], ["מיכל", "אזולאי"], ["רינה", "מלכה"], ["תמר", "גולן"], ["אילנה", "שמש"], ["דבורה", "נחום"],
] as const;

const DEMO_PASSPORT: Passport = {
  number: "38412921",
  birthDate: "1985-03-12",
  issueDate: "2021-06-01",
  expiryDate: "2031-06-01",
  nationality: "ישראלית",
  receivedVia: "whatsapp",
  receivedAt: "2026-10-28T12:32:00.000Z",
  photoAvailable: false,
};

const CUSTOMERS: Customer[] = PEOPLE.map(([firstName, lastName], index) => ({
  id: `c-${index + 1}`,
  firstName,
  lastName,
  phone: `05${[2, 4, 3, 0, 8, 5, 2, 4][index]}${3120418 + index * 7391}`,
  whatsappConnected: index % 2 === 0,
  groupIds: ["g-hanukkah"],
  source: "instagram",
  assigneeId: null,
  since: "2026-05-01T08:00:00.000Z",
  updatedAt: "2026-10-28T12:32:00.000Z",
  passport: index % 2 === 0 ? DEMO_PASSPORT : null,
  mondayPassport: null,
  notes: [],
  leadId: null,
  mondayBoard: "טיסה חנוכה 26",
}));

const TRIP: GroupSummary = {
  id: "g-hanukkah",
  name: "אומן · חנוכה תשפ״ז",
  shortName: "אומן · חנוכה",
  type: "flight",
  womenOnly: false,
  capacity: 45,
  startsOn: "2026-12-06",
  endsOn: "2026-12-10",
  dateLabel: null,
  flight: { outbound: null, inbound: null, airline: null, hotel: null, guide: null },
  mondayBoard: "טיסה חנוכה 26",
  registered: CUSTOMERS.length,
  passportsReceived: 4,
  missingPassports: 4,
  readiness: 50,
};

const PARTICIPANTS: GroupParticipant[] = CUSTOMERS.map((person, index) => ({
  id: `p-${index + 1}`,
  customerId: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  phone: person.phone,
  passport: person.passport ? "received" : "missing",
  passportExpiry: person.passport?.expiryDate ?? null,
  passportExpiringSoon: false,
  note: index === 1 ? "חדר: לבד" : null,
  mondayPassport: null,
  mondayStatus: null,
  eventOn: null,
}));

/** Challah months like Monday's "הפרשות חלה" board: this month and next, with made-up bookings around today. */
const CHALLAH_KINDS = ["הפרשת חלה לכלה · חיפה", "הפרשת חלה ושיעור · חולון", "הפרשת חלה · ירושלים", null, "ערב חינה והפרשת חלה · באר שבע"];
const CHALLAH_OFFSETS = [-6, -2, 3, 4, 9, 16, 24, 31];

function challahMonths(): { groups: GroupSummary[]; bookings: Map<string, GroupParticipant[]> } {
  const today = isoDay(new Date());
  const months = [today.slice(0, 7), shiftMonth(today.slice(0, 7), 1)];
  const groups: GroupSummary[] = months.map((month) => {
    const days = monthDays(month).filter((day): day is string => day !== null);
    const label = formatMonthYear(dayAt(`${month}-15`), "he");
    return {
      ...TRIP,
      id: `g-challah-${month}`,
      name: `הפרשות חלה · ${label}`,
      shortName: `חלה · ${label}`,
      type: "event",
      capacity: null,
      startsOn: days[0],
      endsOn: days[days.length - 1],
      dateLabel: label,
      flight: null,
      mondayBoard: "הפרשות חלה",
      registered: 0,
      passportsReceived: 0,
      missingPassports: 0,
      readiness: null,
    };
  });
  const bookings = new Map<string, GroupParticipant[]>(groups.map((group) => [group.id, []]));
  CHALLAH_OFFSETS.forEach((offset, index) => {
    const day = isoDay(addDays(dayAt(today), offset));
    const group = groups.find((candidate) => candidate.startsOn !== null && candidate.endsOn !== null && day >= candidate.startsOn && day <= candidate.endsOn);
    if (!group) return;
    const person = CUSTOMERS[index % CUSTOMERS.length];
    bookings.get(group.id)?.push({ ...PARTICIPANTS[index % PARTICIPANTS.length], id: `b-${index}`, customerId: person.id, note: CHALLAH_KINDS[index % CHALLAH_KINDS.length], eventOn: day });
  });
  for (const group of groups) group.registered = bookings.get(group.id)?.length ?? 0;
  return { groups, bookings };
}

export function createDemoServices(): DataServices {
  const base: DataServices = createTestServices({ signedIn: true });
  const challah = challahMonths();
  return {
    ...base,
    leads: createDemoLeads(),
    customers: {
      ...base.customers,
      list: async (query = {}) => {
        const term = query.search?.trim() ?? "";
        const items = CUSTOMERS.filter((person) => !term || `${person.firstName} ${person.lastName}`.includes(term) || person.phone.includes(term));
        return { items, total: items.length, page: query.page ?? 1, pageSize: query.pageSize ?? 25 };
      },
      get: async (id) => CUSTOMERS.find((person) => person.id === id) ?? base.customers.get(id),
    },
    groups: {
      list: async () => [TRIP, ...challah.groups],
      get: async (id) => {
        const found = [TRIP, ...challah.groups].find((group) => group.id === id);
        if (!found) throw new NotFoundError("Group", id);
        return found;
      },
      participants: async (id) => challah.bookings.get(id) ?? PARTICIPANTS,
    },
  };
}
