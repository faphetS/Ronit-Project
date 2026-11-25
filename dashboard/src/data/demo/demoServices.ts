/**
 * The sample data a demo account sees: createServices switches every service but the session to this while one is
 * signed in. It stands in for the whole API, so every screen fills and every button works: greetings go through
 * WhatsApp's review and approval, passports open, notes save, people and permissions change, and "copy now" runs.
 * Every name, number, booking and message is invented; none comes from Ronit's data. Changes live in the tab and are
 * gone on refresh.
 */
import { addDays, dayAt, isoDay, monthDays, now, shiftMonth, weekStart } from "../../lib/clock";
import { formatMonthYear } from "../../lib/format";
import { hebrewDateParts } from "../../lib/hebrew";
import { holidayOn, nextHoliday, type HolidayKey } from "../../lib/holidays";
import { MESSAGE_TOKENS } from "../messages";
import { estimateSendMinutes, isOpenLead, passportExpiresSoon } from "../rules";
import { NotFoundError, type CustomerCounts, type CustomerQuery, type LeadCounts, type LeadFilters, type Services } from "../services";
import type {
  Activity,
  AudienceOption,
  AuditEntry,
  BirthdayEntry,
  BirthdaySettings,
  CopyRun,
  CopyTotals,
  Customer,
  CustomerMessage,
  GroupParticipant,
  GroupSummary,
  HolidayCampaign,
  Lead,
  LeadEvent,
  LeadSource,
  LeadStatus,
  Mention,
  MondayCopy,
  Passport,
  PassportAccessEntry,
  PassportIntake,
  PermissionMatrix,
  Role,
  SecuritySettings,
  StaffUser,
  UserAccount,
  UserDirectory,
  UserInvite,
} from "../types";

/** Everything but the session, which stays on the API. */
export type DataServices = Omit<Services, "session">;

const BOARD = { crm: "רונית  - CRM", archive: "רונית -CRM ישן", trip: "טיסה חנוכה 26", tubav: "טיסה טו באב 26", challah: "הפרשות חלה" };
const OFFICE_NOTES = "צוות המשרד";
const DEMO_PHONE = "0501234567";

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;
const iso = (date: Date) => date.toISOString();
const daysAgo = (days: number, time = "10:00") => dayAt(isoDay(addDays(now(), -days)), time);

// ---- Leads: made-up people spread over the last five weeks ----

/** Leads per day, oldest first, ending today. */
const PER_DAY = [2, 1, 0, 3, 4, 2, 5, 3, 1, 0, 4, 6, 3, 2, 5, 2, 0, 3, 4, 7, 5, 3, 1, 0, 4, 5, 2, 6, 7, 9, 14, 3, 2, 8, 2];
const LEAD_NAMES = [
  "שירה כהן", "מיכל אברהם", "נועה ביטון", "רבקה שטרן", "יעל דהן", "אסתר מזרחי", "חנה פרץ", "דבורה אזולאי", "לאה גבאי", "תמר שפירא",
  "אורית חדד", "רחל אוחיון", "מירב סויסה", "מאיה לוי", "הדס כץ", "אפרת ששון", "ליאת בן דוד", "שרית אלון", "גלית רוזן", "נעמה פישר",
];
const SOURCES: LeadSource[] = ["facebook", "instagram", "facebook", "landing-page", "instagram", "referral"];
const MONDAY_GROUP: Record<LeadStatus, string> = {
  new: "לידים חדשים",
  talking: "פולואפ",
  "details-sent": "פולואפ",
  "no-answer": "אין מענה",
  registered: "נסגרו",
  "not-relevant": "לא רלוונטי",
};
const LEAD_NOTE: Record<LeadStatus, string> = {
  new: "מילאה את טופס חנוכה",
  talking: "ביקשה שיחזרו אליה אחרי 16:00",
  "details-sent": "נשלחו פרטי הטיסה בוואטסאפ",
  "no-answer": "לא ענתה, לנסות שוב מחר",
  registered: "נרשמה לטיסת חנוכה",
  "not-relevant": "התאריכים לא מתאימים לה",
};
const NEXT_STEP: Partial<Record<LeadStatus, string>> = {
  talking: "לשלוח מחירון ולחזור אליה ביום ראשון",
  "details-sent": "לוודא שקיבלה את הפרטים",
  "no-answer": "לנסות שוב בערב",
};

function statusFor(age: number, index: number): LeadStatus {
  if (age <= 1) return index % 3 === 2 ? "talking" : "new";
  if (age <= 7) return (["talking", "new", "no-answer", "details-sent", "no-answer"] as const)[index % 5];
  return (["registered", "details-sent", "not-relevant", "no-answer", "talking", "not-relevant"] as const)[index % 6];
}

function buildLeads(): Lead[] {
  const today = isoDay(now());
  const leads: Lead[] = [];
  PER_DAY.forEach((count, offset) => {
    const age = PER_DAY.length - 1 - offset;
    const day = isoDay(addDays(dayAt(today), -age));
    for (let index = 0; index < count; index += 1) {
      const status = statusFor(age, index);
      const at = iso(dayAt(day, `${String(9 + (index % 9)).padStart(2, "0")}:${String((index * 17) % 60).padStart(2, "0")}`));
      const source = SOURCES[(offset * 3 + index) % SOURCES.length];
      leads.push({
        id: `demo-${leads.length}`,
        name: LEAD_NAMES[(offset * 5 + index * 3) % LEAD_NAMES.length],
        phone: `05${(offset + index) % 9}${String(1_000_000 + ((offset * 7919 + index * 104_729) % 9_000_000)).slice(0, 7)}`,
        source,
        status,
        service: (offset + index) % 5 === 0 ? "challah" : "uman",
        groupId: null,
        assigneeId: null,
        mondayBoard: BOARD.crm,
        mondayGroup: MONDAY_GROUP[status],
        mondayUrl: "https://example.monday.com/boards/1/pulses/1",
        createdAt: at,
        updatedAt: at,
        lastNote: LEAD_NOTE[status],
        archived: false,
        calls: status === "no-answer" ? 1 + (index % 3) : status === "new" ? 0 : 1,
        lastCallOn: status === "new" ? null : day,
        inquiryOn: day,
        lastMessage: source === "instagram" ? "היי, אשמח לפרטים על הטיסה לאומן בחנוכה" : null,
        nextStep: NEXT_STEP[status] ?? null,
        mondayPending: false,
        customerId: null,
        tagged: [],
        history: [],
      });
    }
  });
  return leads;
}

/** A note's tags as the API keeps them: each person once, at most 20. */
const tagsOf = (ids: readonly string[] = []) => [...new Set(ids)].slice(0, 20);
const copyNote = (note: LeadEvent): LeadEvent => ({ ...note, mentions: [...note.mentions] });

function createLeads(leads: Lead[], me: StaffUser): DataServices["leads"] {
  // The notes written in the CRM, newest first, per lead.
  const crmNotes = new Map<string, LeadEvent[]>();
  const notesOf = (id: string) => crmNotes.get(id) ?? [];
  // The notes whose tag of the demo user was opened from the bell, or marked read.
  const seen = new Set<string>();
  // Each lead's made-up Monday note, kept apart: a CRM note updates lastNote, and must not reappear as Monday's.
  const mondayNote = new Map(leads.map((lead) => [lead.id, { text: lead.lastNote, at: lead.updatedAt }]));
  const findLead = (id: string) => {
    const lead = leads.find((entry) => entry.id === id);
    if (!lead) throw new NotFoundError("Lead", id);
    return lead;
  };
  const findNote = (id: string, noteId: string) => {
    findLead(id);
    const note = notesOf(id).find((entry) => entry.id === noteId);
    if (!note) throw new NotFoundError("Note", noteId);
    return note;
  };
  const write = (lead: Lead, note: LeadEvent) => {
    crmNotes.set(lead.id, [note, ...notesOf(lead.id)]);
    leads[leads.indexOf(lead)] = { ...lead, lastNote: note.text, updatedAt: note.at };
  };
  // A teammate tagged the demo user on a lead in conversation 40 minutes ago, so the bell has one to show.
  const tagged = leads.findLast((lead) => lead.status === "talking");
  if (tagged) {
    write(tagged, {
      id: nextId("ln"),
      at: iso(new Date(now().getTime() - 40 * 60_000)),
      text: `@${me.name} אפשר לחזור אליה היום? היא שאלה על חדר יחיד בטיסה`,
      byUserId: STAFF.michal,
      author: "מיכל לוי",
      mondayBoard: null,
      source: "crm",
      editedAt: null,
      mentions: [me.id],
    });
  }
  // And the demo user passed a new lead to Michal two hours ago, so the board shows a teammate's face on a card too.
  const passed = leads.findLast((lead) => lead.status === "new");
  if (passed) {
    write(passed, {
      id: nextId("ln"),
      at: iso(new Date(now().getTime() - 2 * 60 * 60_000)),
      text: "@מיכל לוי את לוקחת אותה? ביקשה שיחזרו אליה בערב",
      byUserId: me.id,
      author: me.name,
      mondayBoard: null,
      source: "crm",
      editedAt: null,
      mentions: [STAFF.michal],
    });
  }
  // Who a lead's notes tag, each once, the most recently tagged first (notes are kept newest first).
  const taggedOf = (id: string) => [...new Set(notesOf(id).flatMap((note) => note.mentions))];
  // The notes that tag the demo user, newest first. Tagging yourself doesn't ring the bell.
  const myMentions = (): Mention[] =>
    [...crmNotes.entries()]
      .flatMap(([leadId, notes]) =>
        notes
          .filter((note) => note.byUserId !== me.id && note.mentions.includes(me.id))
          .map((note) => ({ noteId: note.id, leadId, leadName: findLead(leadId).name, byUserId: note.byUserId, at: note.at, text: note.text, seen: seen.has(note.id) })),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
  const unread = () => myMentions().filter((mention) => !mention.seen).length;
  const arrived = (lead: Lead) => lead.inquiryOn ?? isoDay(new Date(lead.createdAt));
  const get = async (id: string): Promise<Lead> => {
    const lead = leads.find((entry) => entry.id === id);
    if (!lead) throw new NotFoundError("Lead", id);
    const first = { id: `${id}-first`, at: lead.createdAt, text: "פנתה דרך הטופס, ביקשה פרטים על הטיסה", byUserId: null, author: OFFICE_NOTES, mondayBoard: lead.mondayBoard, source: "monday" as const, editedAt: null, mentions: [] };
    const monday = mondayNote.get(id) ?? { text: lead.lastNote, at: lead.updatedAt };
    const latest = { id: `${id}-note`, at: monday.at, text: monday.text, byUserId: null, author: OFFICE_NOTES, mondayBoard: lead.mondayBoard, source: "monday" as const, editedAt: null, mentions: [] };
    const fromMonday = lead.status === "new" ? [latest] : [latest, first];
    return { ...lead, tagged: taggedOf(id), history: [...notesOf(id).map(copyNote), ...fromMonday] };
  };
  return {
    list: async (filters: LeadFilters = {}) => {
      const term = filters.search?.trim() ?? "";
      const digits = term.replace(/\D/g, "");
      return leads
        .filter((lead) => (filters.day ? arrived(lead) === filters.day : term ? true : !lead.archived))
        .filter((lead) => (!filters.status || filters.status === "all" ? lead.status !== "not-relevant" : lead.status === filters.status))
        .filter((lead) => !filters.source || lead.source === filters.source)
        .filter((lead) => !filters.service || lead.service === filters.service)
        .filter((lead) => !term || lead.name.includes(term) || (digits.length > 0 && lead.phone.includes(digits)))
        .filter((lead) => filters.tagged !== "me" || taggedOf(lead.id).includes(me.id))
        .map((lead) => ({ ...lead, tagged: taggedOf(lead.id) }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    counts: async () => {
      const counts: LeadCounts = { all: 0, new: 0, "no-answer": 0, talking: 0, "details-sent": 0, registered: 0, "not-relevant": 0 };
      for (const lead of leads) {
        if (lead.archived) continue;
        counts[lead.status] += 1;
        if (lead.status !== "not-relevant") counts.all += 1;
      }
      return counts;
    },
    days: async () => {
      const tally = new Map<string, number>();
      for (const lead of leads) tally.set(arrived(lead), (tally.get(arrived(lead)) ?? 0) + 1);
      return [...tally.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
    },
    get,
    // In memory only, like every change in the demo: there's no Monday behind it, so nothing waits.
    setStatus: async (id, status) => {
      const index = leads.findIndex((entry) => entry.id === id);
      if (index < 0) throw new NotFoundError("Lead", id);
      leads[index] = { ...leads[index], status, mondayPending: false };
      return get(id);
    },
    addNote: async (id, text, mentions) => {
      const lead = findLead(id);
      const note: LeadEvent = { id: nextId("ln"), at: iso(now()), text, byUserId: me.id, author: me.name, mondayBoard: null, source: "crm", editedAt: null, mentions: tagsOf(mentions) };
      write(lead, note);
      return copyNote(note);
    },
    editNote: async (id, noteId, text, mentions) => {
      const note = findNote(id, noteId);
      note.text = text;
      note.editedAt = iso(now());
      if (mentions) note.mentions = tagsOf(mentions);
      return copyNote(note);
    },
    deleteNote: async (id, noteId) => {
      const note = findNote(id, noteId);
      crmNotes.set(id, notesOf(id).filter((entry) => entry !== note));
    },
    mentions: async () => {
      const items = myMentions();
      return { unread: items.filter((mention) => !mention.seen).length, items: items.slice(0, 30) };
    },
    markMentionsSeen: async (noteIds) => {
      for (const mention of myMentions()) if (!noteIds || noteIds.includes(mention.noteId)) seen.add(mention.noteId);
      return { unread: unread() };
    },
  };
}

// ---- The team ----

const STAFF = {
  ronit: "u-ronit",
  michal: "u-michal",
  noa: "u-noa",
};

function buildDirectory(me: StaffUser): UserDirectory {
  const signedIn = iso(addDays(now(), 0));
  return {
    users: [
      {
        id: STAFF.ronit,
        name: "רונית ברש",
        initial: "ר",
        role: "admin",
        passportAccess: true,
        email: "ronit@example.com",
        username: "",
        hasPassword: false,
        lastSignInAt: iso(daysAgo(0, "08:12")),
        twoStep: "active",
        whatsappPhone: "",
      },
      {
        ...me,
        initial: Array.from(me.name.trim())[0] ?? "ד",
        email: "demo@example.com",
        username: "demo",
        // The demo can't change a real password, so the account panel says the office sets it.
        hasPassword: false,
        lastSignInAt: signedIn,
        twoStep: "off",
        whatsappPhone: DEMO_PHONE,
      },
      {
        id: STAFF.michal,
        name: "מיכל לוי",
        initial: "מ",
        role: "office",
        passportAccess: true,
        email: "michal@example.com",
        username: "michal",
        hasPassword: true,
        lastSignInAt: iso(daysAgo(0, "09:40")),
        twoStep: "active",
        whatsappPhone: "",
      },
      {
        id: STAFF.noa,
        name: "נועה כהן",
        initial: "נ",
        role: "sales",
        passportAccess: false,
        email: "noa@example.com",
        username: "noa",
        hasPassword: true,
        lastSignInAt: iso(daysAgo(1, "17:05")),
        twoStep: "active",
        whatsappPhone: "",
      },
    ],
    invites: [
      {
        id: "u-invite-dana",
        email: "dana@example.com",
        username: "dana",
        hasPassword: true,
        role: "sales",
        passportAccess: false,
        sentAt: iso(daysAgo(2, "11:30")),
        sentByUserId: STAFF.ronit,
      },
    ],
  };
}

const PERMISSIONS: PermissionMatrix = [
  { area: "leads", access: { admin: "full", office: "full", sales: "full" }, fixed: ["admin"] },
  { area: "customers", access: { admin: "full", office: "full", sales: "view" }, fixed: ["admin"] },
  { area: "passports", access: { admin: "full", office: "full", sales: "none" }, fixed: ["admin", "sales"] },
  { area: "greetings", access: { admin: "full", office: "full", sales: "none" }, fixed: ["admin"] },
  { area: "import", access: { admin: "full", office: "none", sales: "none" }, fixed: ["admin"] },
  { area: "users", access: { admin: "full", office: "none", sales: "none" }, fixed: ["admin", "office", "sales"] },
];

// ---- Customers, trips and challah months ----

const PEOPLE = [
  ["שרה", "כהן"], ["לאה", "ברגר"], ["פנינה", "לוי"], ["מיכל", "אזולאי"], ["רינה", "מלכה"], ["תמר", "גולן"], ["אילנה", "שמש"], ["דבורה", "נחום"],
  ["חיה", "רוזנברג"], ["אסתר", "פרידמן"], ["יהודית", "קליין"], ["מרים", "שטרן"], ["נחמה", "וייס"], ["רחל", "גרין"], ["בתיה", "הלוי"], ["צביה", "מור"],
  ["אורית", "בן חיים"], ["סיגל", "עמר"], ["ענבל", "טל"], ["הדסה", "ברק"],
] as const;
const CUSTOMER_SOURCES: Customer["source"][] = ["instagram", "facebook", "landing-page", "referral", "monday"];
const ROOM_NOTES = ["חדר: לבד", "חדר: עם אחותה", null, "צמחונית", null, "חדר: עם חברה"];
const FLIGHT_STATUS = ["שולם", "תשלום חלקי", "שולם", "נסגר", "שולם"];

const TRIP_HANUKKAH = "g-hanukkah";
const TRIP_TUBAV = "g-tubav";
const TRIP_NEXT = "g-rosh-hashana";

function passportFor(index: number): Passport | null {
  if (index % 3 === 2) return null;
  const today = now();
  const fromWhatsAppToday = index % 4 === 0;
  return {
    number: String(31_000_000 + index * 1_234_567).slice(0, 8),
    birthDate: `${1962 + ((index * 7) % 36)}-${String(1 + (index % 12)).padStart(2, "0")}-${String(3 + ((index * 5) % 25)).padStart(2, "0")}`,
    issueDate: `${2018 + (index % 5)}-0${1 + (index % 9)}-15`,
    // Every fifth one runs out within half a year, so "expiring" has people in it.
    expiryDate: index % 5 === 0 ? isoDay(addDays(today, 60 + index * 3)) : `${2029 + (index % 6)}-0${1 + (index % 9)}-15`,
    nationality: "ישראלית",
    receivedVia: fromWhatsAppToday ? "whatsapp" : index % 2 === 0 ? "manual" : "monday",
    receivedAt: iso(fromWhatsAppToday ? daysAgo(0, `0${8 + (index % 2)}:${String(10 + index).padStart(2, "0")}`) : daysAgo(20 + index * 2)),
    photoAvailable: false,
  };
}

function groupsOf(index: number): string[] {
  const groups: string[] = [];
  if (index < 12) groups.push(TRIP_HANUKKAH);
  if (index >= 4 && index < 11) groups.push(TRIP_TUBAV);
  if (index >= 14 && index < 19) groups.push(TRIP_NEXT);
  return groups;
}

function buildCustomers(): Customer[] {
  return PEOPLE.map(([firstName, lastName], index) => {
    const passport = passportFor(index);
    const groupIds = groupsOf(index);
    return {
      id: `c-${index + 1}`,
      firstName,
      lastName,
      phone: `05${[2, 4, 3, 0, 8, 5, 2, 4, 3, 0][index % 10]}${3_120_418 + index * 7_391}`,
      whatsappConnected: index % 4 !== 3,
      groupIds,
      source: CUSTOMER_SOURCES[index % CUSTOMER_SOURCES.length],
      assigneeId: null,
      since: iso(daysAgo(30 + index * 9)),
      updatedAt: iso(daysAgo(index % 6)),
      passport,
      mondayPassport: passport ? null : index === 2 ? "in-progress" : null,
      notes:
        index % 3 === 0
          ? [{ id: `n-${index}`, at: iso(daysAgo(index % 5, "12:30")), text: "ביקשה מושב ליד החלון בטיסה", byUserId: STAFF.michal }]
          : [],
      leadId: null,
      mondayBoard: groupIds.includes(TRIP_HANUKKAH) ? BOARD.trip : groupIds.includes(TRIP_TUBAV) ? BOARD.tubav : BOARD.crm,
    };
  });
}

function participantOf(customer: Customer, index: number, reference: Date): GroupParticipant {
  return {
    id: `p-${customer.id}`,
    customerId: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    passport: customer.passport ? "received" : "missing",
    passportExpiry: customer.passport?.expiryDate ?? null,
    passportExpiringSoon: customer.passport ? passportExpiresSoon(customer.passport.expiryDate, reference) : false,
    note: ROOM_NOTES[index % ROOM_NOTES.length],
    mondayPassport: customer.mondayPassport,
    mondayStatus: FLIGHT_STATUS[index % FLIGHT_STATUS.length],
    eventOn: null,
    addedInCrm: false,
  };
}

const CHALLAH_KINDS = ["הפרשת חלה לכלה · חיפה", "הפרשת חלה ושיעור · חולון", "הפרשת חלה · ירושלים", null, "ערב חינה והפרשת חלה · באר שבע"];
const CHALLAH_OFFSETS = [-6, -2, 3, 4, 9, 16, 24, 31];

interface Trips {
  groups: GroupSummary[];
  participants: Map<string, GroupParticipant[]>;
}

function summarize(group: Omit<GroupSummary, "registered" | "passportsReceived" | "missingPassports" | "readiness">, rows: GroupParticipant[]): GroupSummary {
  const received = rows.filter((row) => row.passport === "received" || row.mondayPassport === "yes").length;
  return {
    ...group,
    registered: rows.length,
    passportsReceived: group.type === "flight" ? received : 0,
    missingPassports: group.type === "flight" ? rows.length - received : 0,
    readiness: group.type === "flight" ? (rows.length ? Math.round((received / rows.length) * 100) : 0) : null,
  };
}

function buildTrips(customers: Customer[]): Trips {
  const reference = now();
  const participants = new Map<string, GroupParticipant[]>();
  const flightRows = (groupId: string) =>
    customers.flatMap((customer, index) => (customer.groupIds.includes(groupId) ? [participantOf(customer, index, reference)] : []));
  for (const id of [TRIP_HANUKKAH, TRIP_TUBAV, TRIP_NEXT]) participants.set(id, flightRows(id));

  const flights: GroupSummary[] = [
    summarize(
      {
        id: TRIP_HANUKKAH,
        name: "אומן · חנוכה תשפ״ז",
        shortName: "אומן · חנוכה",
        type: "flight",
        womenOnly: false,
        capacity: 45,
        startsOn: "2026-12-06",
        endsOn: "2026-12-10",
        dateLabel: null,
        flight: {
          outbound: { date: "2026-12-06", time: "06:40", from: "נתב״ג", to: "קישינב" },
          inbound: { date: "2026-12-10", time: "21:15", from: "קישינב", to: "נתב״ג" },
          airline: "טיסת שכר",
          hotel: "מלון באומן, ליד הציון",
          guide: "רונית ברש",
        },
        mondayBoard: BOARD.trip,
        fromCrm: false,
      },
      participants.get(TRIP_HANUKKAH) ?? [],
    ),
    summarize(
      {
        id: TRIP_NEXT,
        name: "אומן · ראש השנה תשפ״ח",
        shortName: "אומן · ראש השנה",
        type: "flight",
        womenOnly: false,
        capacity: 60,
        startsOn: null,
        endsOn: null,
        dateLabel: "ספטמבר 2027",
        flight: { outbound: null, inbound: null, airline: null, hotel: null, guide: null },
        mondayBoard: null,
        fromCrm: false,
      },
      participants.get(TRIP_NEXT) ?? [],
    ),
    summarize(
      {
        id: TRIP_TUBAV,
        name: "אומן · ט״ו באב לנשים",
        shortName: "אומן · ט״ו באב",
        type: "flight",
        womenOnly: true,
        capacity: 40,
        startsOn: "2026-07-28",
        endsOn: "2026-08-01",
        dateLabel: null,
        flight: {
          outbound: { date: "2026-07-28", time: "05:55", from: "נתב״ג", to: "קישינב" },
          inbound: { date: "2026-08-01", time: "22:30", from: "קישינב", to: "נתב״ג" },
          airline: "טיסת שכר",
          hotel: "מלון באומן",
          guide: "רונית ברש",
        },
        mondayBoard: BOARD.tubav,
        fromCrm: false,
      },
      participants.get(TRIP_TUBAV) ?? [],
    ),
  ];

  // Challah months, like Monday's "הפרשות חלה" board: this month and next, with bookings around today.
  const today = isoDay(reference);
  const months = [today.slice(0, 7), shiftMonth(today.slice(0, 7), 1)];
  const challahBase = months.map((month) => {
    const days = monthDays(month).filter((day): day is string => day !== null);
    const label = formatMonthYear(dayAt(`${month}-15`), "he");
    return {
      id: `g-challah-${month}`,
      name: `הפרשות חלה · ${label}`,
      shortName: `חלה · ${label}`,
      type: "event" as const,
      womenOnly: true,
      capacity: null,
      startsOn: days[0],
      endsOn: days[days.length - 1],
      dateLabel: label,
      flight: null,
      mondayBoard: BOARD.challah,
      fromCrm: false,
    };
  });
  for (const group of challahBase) participants.set(group.id, []);
  CHALLAH_OFFSETS.forEach((offset, index) => {
    const day = isoDay(addDays(dayAt(today), offset));
    const group = challahBase.find((candidate) => day >= candidate.startsOn && day <= candidate.endsOn);
    if (!group) return;
    const person = customers[12 + (index % 8)];
    participants.get(group.id)?.push({
      id: `b-${index}`,
      customerId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
      passport: person.passport ? "received" : "missing",
      passportExpiry: person.passport?.expiryDate ?? null,
      passportExpiringSoon: false,
      note: CHALLAH_KINDS[index % CHALLAH_KINDS.length],
      mondayPassport: null,
      mondayStatus: null,
      eventOn: day,
      addedInCrm: false,
    });
  });
  const challah = challahBase.map((group) => summarize(group, participants.get(group.id) ?? []));
  return { groups: [...flights, ...challah], participants };
}

// ---- Holiday greetings ----

const HOLIDAY_TEXT: Partial<Record<HolidayKey, string>> = {
  hanukkah: `${MESSAGE_TOKENS.firstName}, חנוכה שמח! 🕎 שהאור של הנרות ימלא את הבית שלך בשמחה ובברכה. באהבה, רונית ואור הצדיק`,
  roshHashana: `${MESSAGE_TOKENS.firstName}, שנה טובה ומתוקה! 🍎 מאחלים לך שנה של בריאות, שמחה וגאולה. באהבה, רונית ואור הצדיק`,
  yomKippur: `${MESSAGE_TOKENS.firstName}, גמר חתימה טובה! שתיכתבי ותיחתמי לחיים טובים. באהבה, רונית ואור הצדיק`,
  sukkot: `${MESSAGE_TOKENS.firstName}, חג סוכות שמח! 🌿 מאחלים לך חג של שמחה ואור. באהבה, רונית ואור הצדיק`,
};
const holidayText = (key: HolidayKey) =>
  HOLIDAY_TEXT[key] ?? `${MESSAGE_TOKENS.firstName}, חג שמח! מאחלים לך ולמשפחה חג של אור ושמחה. באהבה, רונית ואור הצדיק`;
const RATE = { messages: 50, everyMinutes: 10 };
const STAGE: Record<HolidayCampaign["status"], HolidayCampaign["stage"]> = {
  draft: "write",
  "in-review": "review",
  "awaiting-approval": "approve",
  scheduled: "track",
  sending: "track",
  completed: "track",
};

/** The holidays of the last eight months, newest first: the greetings that already went out. */
function pastHolidays(reference: Date): Array<{ key: HolidayKey; day: Date }> {
  const found: Array<{ key: HolidayKey; day: Date }> = [];
  for (let offset = 1; offset <= 240 && found.length < 3; offset += 1) {
    const day = addDays(reference, -offset);
    const key = holidayOn(day);
    if (key) found.push({ key, day });
  }
  return found;
}

function buildCampaigns(customers: Customer[], me: StaffUser): HolidayCampaign[] {
  const reference = now();
  const first = customers[0];
  const upcoming = nextHoliday(reference);
  const eve = isoDay(upcoming.eve);
  const current: HolidayCampaign = {
    id: `camp-${upcoming.key}`,
    holiday: upcoming.key,
    hebrewYear: hebrewDateParts(upcoming.day).year,
    stage: "write",
    status: "draft",
    eve,
    sendAt: iso(dayAt(eve, "12:00")),
    message: holidayText(upcoming.key),
    audienceId: "all",
    recipients: customers.length,
    rate: RATE,
    estimatedMinutes: estimateSendMinutes(customers.length, RATE),
    preview: { customerId: first.id, firstName: first.firstName, lastName: first.lastName, groupName: "אומן · חנוכה" },
    savedAt: iso(daysAgo(1, "18:20")),
    savedByUserId: me.id,
    approvedAt: null,
    approvedByUserId: null,
    lastTest: null,
    template: null,
    stats: null,
  };
  const past = pastHolidays(reference).map(({ key, day }, index): HolidayCampaign => {
    const pastEve = isoDay(addDays(day, -1));
    const sent = customers.length;
    const failed = index === 0 ? 1 : 0;
    return {
      id: `camp-${key}-${pastEve}`,
      holiday: key,
      hebrewYear: hebrewDateParts(day).year,
      stage: "track",
      status: "completed",
      eve: pastEve,
      sendAt: iso(dayAt(pastEve, "12:00")),
      message: holidayText(key),
      audienceId: "all",
      recipients: sent,
      rate: RATE,
      estimatedMinutes: estimateSendMinutes(sent, RATE),
      preview: null,
      savedAt: iso(addDays(dayAt(pastEve, "10:00"), -5)),
      savedByUserId: STAFF.ronit,
      approvedAt: iso(addDays(dayAt(pastEve, "09:00"), -2)),
      approvedByUserId: STAFF.ronit,
      lastTest: { at: iso(addDays(dayAt(pastEve, "09:30"), -3)), toUserId: STAFF.ronit },
      template: { status: "APPROVED", reason: null },
      stats: { sent, delivered: sent - failed, read: sent - failed - 3 - index, failed },
    };
  });
  return [current, ...past];
}

// ---- Birthdays ----

function birthdayEntry(customer: Customer, day: string, settings: BirthdaySettings, status: BirthdayEntry["status"]): BirthdayEntry {
  const born = Number((customer.passport?.birthDate ?? "1980").slice(0, 4));
  return {
    customerId: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    day,
    age: Number(day.slice(0, 4)) - born,
    sendAt: iso(dayAt(day, settings.sendTime)),
    onShabbat: dayAt(day).getDay() === 6,
    status,
    failure: status === "failed" ? "invalid-number" : null,
  };
}

// ---- The copy from Monday ----

function copyTotals(leads: Lead[], customers: Customer[], groups: GroupSummary[]): CopyTotals {
  return {
    itemsFound: leads.length + 650 + customers.length + 30,
    leads: leads.length,
    archivedLeads: 650,
    withoutPhone: 41,
    customers: customers.length,
    groups: groups.length,
    duplicatesMerged: 3,
    notes: leads.length * 2,
  };
}

/** The last odd hour, when the scheduled copy ran (07:00 to 23:00), and the next one. */
function copyTimes(reference: Date): { last: Date; next: Date } {
  const last = new Date(reference);
  last.setMinutes(0, 0, 0);
  if (last.getHours() % 2 === 0) last.setHours(last.getHours() - 1);
  const next = new Date(last.getTime() + 2 * 3_600_000);
  return { last, next };
}

// ---- All of it together ----

/** The sample data for the signed-in demo account `me`, fresh for each sign-in. */
export function createDemoServices(me: StaffUser): DataServices {
  const leads = buildLeads();
  const customers = buildCustomers();
  const trips = buildTrips(customers);
  const directory = buildDirectory(me);
  const permissions: PermissionMatrix = PERMISSIONS.map((row) => ({ ...row, access: { ...row.access }, fixed: [...row.fixed] }));
  let security: SecuritySettings = { twoStepRequired: true, maskPassportNumbers: true, autoSignOut: true, passportAccessLog: true, autoSignOutMinutes: 30 };
  const campaigns = buildCampaigns(customers, me);
  let birthdaySettings: BirthdaySettings = {
    enabled: true,
    sendTime: "09:00",
    channel: "whatsapp",
    birthDateSource: "passport",
    shabbatRule: "after-shabbat",
    template: `יום הולדת שמח ${MESSAGE_TOKENS.firstName}! 🎉 מאחלים לך שנה של אור, בריאות ושמחה. באהבה, רונית ואור הצדיק`,
    templateUpdatedAt: iso(daysAgo(40)),
    approvedTemplate: `יום הולדת שמח ${MESSAGE_TOKENS.firstName}! 🎉 מאחלים לך שנה של אור, בריאות ושמחה. באהבה, רונית ואור הצדיק`,
    templateReview: null,
  };
  const times = copyTimes(now());
  const totals = copyTotals(leads, customers, trips.groups);
  const finishedRun = (id: string, trigger: CopyRun["trigger"], byUserId: string | null, startedAt: Date): CopyRun => ({
    id,
    trigger,
    byUserId,
    status: "completed",
    startedAt: iso(startedAt),
    finishedAt: iso(new Date(startedAt.getTime() + 21_000)),
    boardsRead: 4,
    apiCalls: 9,
    totals,
    error: null,
  });
  const copy: MondayCopy = {
    enabled: true,
    lastRun: finishedRun("run-scheduled", "schedule", null, times.last),
    lastCopiedAt: iso(new Date(times.last.getTime() + 21_000)),
    nextRunAt: iso(times.next),
    boards: [
      { id: "b-crm", name: BOARD.crm.replace("  ", " "), kind: "crm", items: leads.length + 41, groups: 6, copiedAt: iso(times.last) },
      { id: "b-archive", name: BOARD.archive, kind: "crm-archive", items: 650, groups: 3, copiedAt: iso(times.last) },
      { id: "b-trip", name: BOARD.trip, kind: "flight", items: trips.participants.get(TRIP_HANUKKAH)?.length ?? 0, groups: 2, copiedAt: iso(times.last) },
      { id: "b-challah", name: BOARD.challah, kind: "challah", items: 30, groups: 12, copiedAt: iso(times.last) },
    ],
    totals,
  };

  const customerName = (customer: Customer) => `${customer.firstName} ${customer.lastName}`;
  const audit: AuditEntry[] = [
    { id: nextId("a"), at: iso(now()), byUserId: me.id, action: "new-device-sign-in" },
    { id: nextId("a"), at: iso(daysAgo(0, "09:12")), byUserId: null, action: "passport-received", customerId: customers[0].id, customerName: customerName(customers[0]), via: "whatsapp" },
    { id: nextId("a"), at: iso(daysAgo(0, "08:55")), byUserId: STAFF.michal, action: "passport-view", customerId: customers[1].id, customerName: customerName(customers[1]) },
    { id: nextId("a"), at: iso(daysAgo(1, "15:00")), byUserId: STAFF.ronit, action: "monday-copy" },
    { id: nextId("a"), at: iso(daysAgo(2, "11:30")), byUserId: STAFF.ronit, action: "staff-invited", userId: "u-invite-dana", userName: "dana@example.com" },
    ...campaigns
      .filter((campaign) => campaign.status === "completed" && campaign.approvedAt)
      .map((campaign): AuditEntry => ({ id: nextId("a"), at: campaign.approvedAt ?? iso(now()), byUserId: STAFF.ronit, action: "greeting-approve", campaignId: campaign.id, holiday: campaign.holiday })),
  ];
  const accessLogs = new Map<string, PassportAccessEntry[]>();
  for (const customer of customers) {
    if (!customer.passport) continue;
    accessLogs.set(customer.id, [
      { id: nextId("a"), at: customer.passport.receivedAt, byUserId: null, action: "passport-received", customerId: customer.id, customerName: customerName(customer), via: customer.passport.receivedVia },
    ]);
  }
  const log = (entry: AuditEntry) => {
    audit.unshift(entry);
    return entry;
  };

  const findCustomer = (id: string) => {
    const customer = customers.find((candidate) => candidate.id === id);
    if (!customer) throw new NotFoundError("Customer", id);
    return customer;
  };
  const findGroupIndex = (id: string) => {
    const index = trips.groups.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw new NotFoundError("Group", id);
    return index;
  };
  /** The group's counts again, after its people changed. */
  const resummarize = (group: GroupSummary) => summarize(group, trips.participants.get(group.id) ?? []);
  const findCampaign = (id: string) => {
    const campaign = campaigns.find((candidate) => candidate.id === id);
    if (!campaign) throw new NotFoundError("Campaign", id);
    return campaign;
  };
  const meAccount = () => directory.users.find((user) => user.id === me.id) as UserAccount;
  const nameOf = (userId: string) =>
    directory.users.find((user) => user.id === userId)?.name ?? directory.invites.find((invite) => invite.id === userId)?.email ?? "";
  const snapshot = (): UserDirectory => ({ users: directory.users.map((user) => ({ ...user })), invites: directory.invites.map((invite) => ({ ...invite })) });
  const audiences = (): AudienceOption[] => [
    { id: "all", kind: "all", name: null, shortName: null, groupIds: [], recipients: customers.length },
    ...trips.groups
      .filter((group) => group.type === "flight" && group.registered > 0)
      .map((group) => ({ id: `aud-${group.id}`, kind: "groups" as const, name: group.name, shortName: group.shortName, groupIds: [group.id], recipients: group.registered })),
  ];
  const touch = (campaign: HolidayCampaign) => {
    campaign.stage = STAGE[campaign.status];
    campaign.savedAt = iso(now());
    campaign.savedByUserId = me.id;
    return { ...campaign };
  };
  const today = isoDay(now());
  const counts = (): CustomerCounts => {
    const reference = now();
    return {
      all: customers.length,
      "whatsapp-today": customers.filter((c) => c.passport?.receivedVia === "whatsapp" && isoDay(new Date(c.passport.receivedAt)) === today).length,
      expiring: customers.filter((c) => c.passport && passportExpiresSoon(c.passport.expiryDate, reference)).length,
      "missing-passport": customers.filter((c) => !c.passport).length,
      withPassport: customers.filter((c) => c.passport).length,
    };
  };
  const matches = (customer: Customer, query: CustomerQuery, reference: Date) => {
    switch (query.filter) {
      case "whatsapp-today":
        return customer.passport?.receivedVia === "whatsapp" && isoDay(new Date(customer.passport.receivedAt)) === today;
      case "expiring":
        return customer.passport !== null && passportExpiresSoon(customer.passport.expiryDate, reference);
      case "missing-passport":
        return customer.passport === null;
      default:
        return true;
    }
  };
  const intakes: PassportIntake[] = [
    { id: "i-1", name: customerName(customers[0]), phone: customers[0].phone, receivedAt: iso(daysAgo(0, "09:12")), result: "matched", reason: "name", customerId: customers[0].id },
    { id: "i-2", name: customerName(customers[8]), phone: customers[8].phone, receivedAt: iso(daysAgo(0, "08:40")), result: "new-card", reason: "no-match", customerId: customers[8].id },
    { id: "i-3", name: "גילה אדלר", phone: "0547712093", receivedAt: iso(daysAgo(0, "07:58")), result: "needs-review", reason: "ambiguous", customerId: null },
  ];

  return {
    leads: createLeads(leads, me),

    customers: {
      list: async (query = {}) => {
        const reference = now();
        const term = query.search?.trim() ?? "";
        const digits = term.replace(/\D/g, "");
        const items = customers
          .filter((customer) => matches(customer, query, reference))
          .filter(
            (customer) =>
              !term ||
              customerName(customer).includes(term) ||
              (digits.length > 0 && (customer.phone.includes(digits) || (customer.passport?.number.includes(digits) ?? false))),
          );
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 25;
        return { items: items.slice((page - 1) * pageSize, page * pageSize).map((customer) => ({ ...customer })), total: items.length, page, pageSize };
      },
      get: async (id) => ({ ...findCustomer(id) }),
      intakes: async () => intakes,
      counts: async () => counts(),
      messages: async (id) => {
        const customer = findCustomer(id);
        const lines: CustomerMessage[] = campaigns.map((campaign, index) => ({
          id: `m-${customer.id}-${campaign.id}`,
          customerId: customer.id,
          kind: "holiday",
          holiday: campaign.holiday,
          hebrewYear: campaign.hebrewYear,
          campaignId: campaign.id,
          at: campaign.sendAt,
          status:
            campaign.status === "completed"
              ? customer.whatsappConnected
                ? index % 2 === 0
                  ? "read"
                  : "delivered"
                : "failed"
              : campaign.status === "scheduled"
                ? "scheduled"
                : "awaiting-approval",
          failure: campaign.status === "completed" && !customer.whatsappConnected ? "blocked" : null,
        }));
        return lines.sort((a, b) => b.at.localeCompare(a.at));
      },
      accessLog: async (id) => [...(accessLogs.get(id) ?? [])],
      addNote: async (id, text) => {
        const customer = findCustomer(id);
        customer.notes = [{ id: nextId("n"), at: iso(now()), text, byUserId: me.id }, ...customer.notes];
        customer.updatedAt = iso(now());
        return { ...customer };
      },
      logPassportView: async (id, part) => {
        const customer = findCustomer(id);
        const entry: PassportAccessEntry = {
          id: nextId("a"),
          at: iso(now()),
          byUserId: me.id,
          action: part === "photo" ? "passport-photo-view" : "passport-view",
          customerId: customer.id,
          customerName: customerName(customer),
        };
        if (security.passportAccessLog) {
          accessLogs.set(id, [entry, ...(accessLogs.get(id) ?? [])]);
          log(entry);
        }
        return { entry: security.passportAccessLog ? entry : null, number: part === "details" ? (customer.passport?.number ?? null) : null };
      },
    },

    groups: {
      list: async () => trips.groups.map((group) => ({ ...group })),
      get: async (id) => {
        const group = trips.groups.find((candidate) => candidate.id === id);
        if (!group) throw new NotFoundError("Group", id);
        return { ...group };
      },
      participants: async (id) => {
        if (!trips.groups.some((group) => group.id === id)) throw new NotFoundError("Group", id);
        return [...(trips.participants.get(id) ?? [])];
      },
      create: async (input) => {
        const group = summarize(
          {
            id: nextId("g"),
            name: input.name,
            shortName: input.name,
            type: input.type,
            womenOnly: false,
            capacity: input.capacity ?? null,
            startsOn: input.startsOn ?? null,
            endsOn: input.endsOn ?? null,
            dateLabel: null,
            flight: null,
            mondayBoard: null,
            fromCrm: true,
          },
          [],
        );
        trips.groups.push(group);
        trips.participants.set(group.id, []);
        return { ...group };
      },
      update: async (id, patch) => {
        const index = findGroupIndex(id);
        const { name, type, startsOn, endsOn, capacity } = patch;
        const next = {
          ...trips.groups[index],
          ...(name !== undefined ? { name, shortName: name } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(startsOn !== undefined ? { startsOn } : {}),
          ...(endsOn !== undefined ? { endsOn } : {}),
          ...(capacity !== undefined ? { capacity } : {}),
        };
        trips.groups[index] = resummarize(next);
        return { ...trips.groups[index] };
      },
      remove: async (id) => {
        const index = findGroupIndex(id);
        trips.groups.splice(index, 1);
        trips.participants.delete(id);
        for (const customer of customers) customer.groupIds = customer.groupIds.filter((groupId) => groupId !== id);
        leads.forEach((lead, at) => {
          if (lead.groups?.some((group) => group.id === id)) leads[at] = { ...lead, groups: lead.groups.filter((group) => group.id !== id) };
        });
      },
      addLead: async (id, leadId) => {
        const index = findGroupIndex(id);
        const leadIndex = leads.findIndex((entry) => entry.id === leadId);
        if (leadIndex < 0) throw new NotFoundError("Lead", leadId);
        const lead = leads[leadIndex];
        let customer = customers.find((entry) => entry.id === lead.customerId) ?? customers.find((entry) => entry.phone === lead.phone);
        if (!customer) {
          const [firstName = lead.name, ...rest] = lead.name.split(" ");
          customer = {
            id: nextId("c"),
            firstName,
            lastName: rest.join(" "),
            phone: lead.phone,
            whatsappConnected: false,
            groupIds: [],
            source: "monday",
            assigneeId: null,
            since: iso(now()),
            updatedAt: iso(now()),
            passport: null,
            mondayPassport: null,
            notes: [],
            leadId: lead.id,
            mondayBoard: null,
          };
          customers.push(customer);
        }
        const rows = trips.participants.get(id) ?? [];
        const alreadyMember = rows.some((row) => row.customerId === customer.id);
        if (!alreadyMember) {
          rows.push({ ...participantOf(customer, rows.length, now()), id: nextId("p"), mondayStatus: null, note: null, addedInCrm: true });
          trips.participants.set(id, rows);
          customer.groupIds.push(id);
          trips.groups[index] = resummarize(trips.groups[index]);
        }
        const group = trips.groups[index];
        const joined = lead.groups ?? [];
        leads[leadIndex] = {
          ...lead,
          status: "registered",
          mondayPending: false,
          customerId: customer.id,
          groups: joined.some((entry) => entry.id === id) ? joined : [...joined, { id, name: group.name, type: group.type }],
        };
        return { customerId: customer.id, alreadyMember };
      },
      removeMember: async (id, memberId) => {
        const index = findGroupIndex(id);
        const rows = trips.participants.get(id) ?? [];
        const member = rows.find((row) => row.id === memberId);
        if (!member) throw new NotFoundError("Member", memberId);
        trips.participants.set(id, rows.filter((row) => row !== member));
        const customer = customers.find((entry) => entry.id === member.customerId);
        if (customer) customer.groupIds = customer.groupIds.filter((groupId) => groupId !== id);
        leads.forEach((lead, at) => {
          if (lead.customerId === member.customerId && lead.groups?.some((group) => group.id === id)) {
            leads[at] = { ...lead, groups: lead.groups.filter((group) => group.id !== id) };
          }
        });
        trips.groups[index] = resummarize(trips.groups[index]);
      },
    },

    overview: {
      stats: async () => {
        const thisWeek = weekStart(now());
        const lastWeek = addDays(thisWeek, -7);
        const arrivedOn = (lead: Lead) => dayAt(lead.inquiryOn ?? isoDay(new Date(lead.createdAt)));
        const inWeek = (lead: Lead, start: Date) => {
          const day = arrivedOn(lead);
          return day >= start && day < addDays(start, 7);
        };
        const fresh = leads.filter((lead) => inWeek(lead, thisWeek));
        return {
          openLeads: leads.filter((lead) => !lead.archived && isOpenLead(lead)).length,
          customers: customers.length,
          activeGroups: trips.groups.filter((group) => group.type === "flight" && (group.endsOn === null || group.endsOn >= today)).length,
          newLeadsThisWeek: fresh.length,
          newLeadsLastWeek: leads.filter((lead) => inWeek(lead, lastWeek)).length,
          thisWeekByStatus: {
            new: fresh.filter((lead) => lead.status === "new").length,
            talking: fresh.filter((lead) => lead.status === "talking" || lead.status === "details-sent").length,
            registered: fresh.filter((lead) => lead.status === "registered").length,
          },
          weeklyLeads: Array.from({ length: 8 }, (_, index) => {
            const start = addDays(thisWeek, -7 * (7 - index));
            return { weekStart: isoDay(start), count: leads.filter((lead) => inWeek(lead, start)).length };
          }),
        };
      },
      activity: async () => {
        const newest = [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
        const items: Activity[] = [
          ...newest.map((lead): Activity => ({ id: `act-${lead.id}`, at: lead.createdAt, kind: "lead", name: lead.name, source: lead.source, service: lead.service })),
          { id: "act-reg-1", at: iso(daysAgo(0, "11:20")), kind: "registration", name: customerName(customers[3]), group: "אומן · חנוכה" },
          { id: "act-reg-2", at: iso(daysAgo(1, "16:45")), kind: "registration", name: customerName(customers[15]), group: "אומן · ראש השנה" },
          ...intakes.map((intake): Activity => ({ id: `act-${intake.id}`, at: intake.receivedAt, kind: "passport", name: intake.name, result: intake.result })),
          { id: "act-import", at: copy.lastCopiedAt ?? iso(now()), kind: "import", leads: totals.leads, customers: totals.customers },
        ];
        return items.sort((a, b) => b.at.localeCompare(a.at));
      },
    },

    greetings: {
      current: async () => {
        const open = campaigns.find((campaign) => campaign.status !== "completed");
        return open ? { ...open } : null;
      },
      create: async () => {
        const open = campaigns.find((campaign) => campaign.status !== "completed");
        if (open) return { ...open };
        const fresh = buildCampaigns(customers, me)[0];
        campaigns.unshift(fresh);
        return { ...fresh };
      },
      submit: async (id) => {
        const campaign = findCampaign(id);
        // WhatsApp approves the text at once in the demo, so the next step is Ronit's approval.
        campaign.status = "awaiting-approval";
        campaign.template = { status: "APPROVED", reason: null };
        log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "greeting-edit", campaignId: campaign.id, holiday: campaign.holiday });
        return touch(campaign);
      },
      whatsapp: async () => ({ connected: true, sending: true }),
      history: async () => campaigns.map((campaign) => ({ ...campaign })),
      audiences: async () => audiences(),
      update: async (id, patch) => {
        const campaign = findCampaign(id);
        if (patch.message !== undefined && patch.message !== campaign.message) {
          campaign.message = patch.message;
          // Edited text goes back through WhatsApp's review, as on the real system.
          campaign.status = "draft";
          campaign.template = null;
          campaign.approvedAt = null;
          campaign.approvedByUserId = null;
        }
        if (patch.audienceId !== undefined && patch.audienceId !== campaign.audienceId) {
          const audience = audiences().find((option) => option.id === patch.audienceId);
          if (audience) {
            campaign.audienceId = audience.id;
            campaign.recipients = audience.recipients;
            campaign.estimatedMinutes = estimateSendMinutes(audience.recipients, campaign.rate);
            if (campaign.status === "scheduled") campaign.status = "awaiting-approval";
          }
        }
        log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "greeting-edit", campaignId: campaign.id, holiday: campaign.holiday });
        return touch(campaign);
      },
      approve: async (id) => {
        const campaign = findCampaign(id);
        campaign.status = "scheduled";
        campaign.template ??= { status: "APPROVED", reason: null };
        campaign.approvedAt = iso(now());
        campaign.approvedByUserId = me.id;
        log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "greeting-approve", campaignId: campaign.id, holiday: campaign.holiday });
        return touch(campaign);
      },
      sendTest: async (id) => {
        const campaign = findCampaign(id);
        campaign.lastTest = { at: iso(now()), toUserId: me.id };
        log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "greeting-test", campaignId: campaign.id, holiday: campaign.holiday, to: meAccount().whatsappPhone || DEMO_PHONE });
        return { ...campaign };
      },
    },

    birthdays: {
      settings: async () => ({ ...birthdaySettings }),
      overview: async () => {
        const reference = now();
        const withPassport = customers.filter((customer) => customer.passport);
        const at = (offset: number) => isoDay(addDays(reference, offset));
        const sentToday = reference.getTime() >= dayAt(today, birthdaySettings.sendTime).getTime();
        const waiting = birthdaySettings.enabled ? "scheduled" : "paused";
        return {
          today: [birthdayEntry(withPassport[2], today, birthdaySettings, sentToday ? "delivered" : waiting)],
          upcoming: [1, 2, 4, 6].map((offset, index) => birthdayEntry(withPassport[3 + index], at(offset), birthdaySettings, waiting)),
          recent: (["read", "read", "delivered", "failed", "read"] as const).map((status, index) =>
            birthdayEntry(withPassport[(7 + index) % withPassport.length], at(-1 - index * 3), birthdaySettings, status),
          ),
          sentThisYear: 64,
        };
      },
      updateSettings: async (patch) => {
        const templateChanged = patch.template !== undefined && patch.template !== birthdaySettings.template;
        birthdaySettings = {
          ...birthdaySettings,
          ...patch,
          ...(templateChanged ? { templateUpdatedAt: iso(now()), approvedTemplate: patch.template ?? null, templateReview: null } : {}),
        };
        return { ...birthdaySettings };
      },
    },

    users: {
      list: async () => snapshot(),
      updateProfile: async ({ name, whatsappPhone }) => {
        const account = meAccount();
        const phoneChanged = whatsappPhone !== undefined && whatsappPhone !== account.whatsappPhone;
        account.name = name;
        account.initial = Array.from(name.trim())[0] ?? account.initial;
        if (whatsappPhone !== undefined) account.whatsappPhone = whatsappPhone;
        if (phoneChanged) log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "staff-phone-changed", userId: me.id, userName: name, phone: account.whatsappPhone });
        return { ...account };
      },
      permissions: async () => permissions.map((row) => ({ ...row, access: { ...row.access } })),
      changePermission: async ({ role, area, access }) => {
        const row = permissions.find((candidate) => candidate.area === area);
        if (row && !row.fixed.includes(role) && row.access[role] !== access) {
          row.access[role] = access;
          log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "permission-change", role, area, access });
        }
        return permissions.map((candidate) => ({ ...candidate, access: { ...candidate.access } }));
      },
      changeAccess: async (userId, { role, passportAccess }) => {
        const target: { role: Role; passportAccess: boolean } | undefined =
          directory.users.find((user) => user.id === userId) ?? directory.invites.find((invite) => invite.id === userId);
        if (!target) throw new NotFoundError("User", userId);
        target.role = role;
        target.passportAccess = role !== "sales" && passportAccess;
        log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "staff-access-changed", userId, userName: nameOf(userId), role, passportAccess: target.passportAccess });
        return snapshot();
      },
      changeSignIn: async (userId, change) => {
        const target: { username: string; hasPassword: boolean } | undefined =
          directory.users.find((user) => user.id === userId) ?? directory.invites.find((invite) => invite.id === userId);
        if (!target) throw new NotFoundError("User", userId);
        if (change.username !== undefined && change.username !== target.username) {
          target.username = change.username;
          log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "username-changed", userId, userName: nameOf(userId), username: change.username });
        }
        if (change.password) {
          target.hasPassword = true;
          log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "password-set", userId, userName: nameOf(userId), own: userId === me.id });
        }
        return snapshot();
      },
      // The account panel offers no password change to the demo (hasPassword is false), so this never runs.
      changeOwnPassword: async () => undefined,
      security: async () => ({ ...security }),
      updateSecurity: async (key, enabled) => {
        if (security[key] !== enabled) {
          security = { ...security, [key]: enabled };
          log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "security-change", setting: key, enabled });
        }
        return { ...security };
      },
      audit: async () => [...audit],
      invite: async (input) => {
        const invite: UserInvite = {
          id: nextId("u-invite"),
          email: input.email.trim().toLowerCase(),
          username: input.username?.trim().toLowerCase() ?? "",
          hasPassword: Boolean(input.password),
          role: input.role,
          passportAccess: input.role !== "sales" && input.passportAccess,
          sentAt: iso(now()),
          sentByUserId: me.id,
        };
        directory.invites.push(invite);
        log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "staff-invited", userId: invite.id, userName: invite.email });
        return { invite: { ...invite }, emailed: true };
      },
      remove: async (userId) => {
        const userName = nameOf(userId);
        directory.users = directory.users.filter((user) => user.id !== userId);
        directory.invites = directory.invites.filter((invite) => invite.id !== userId);
        log({ id: nextId("a"), at: iso(now()), byUserId: me.id, action: "staff-removed", userId, userName });
      },
    },

    imports: {
      latest: async () => ({ ...copy, boards: copy.boards.map((board) => ({ ...board })) }),
      copyNow: async () => {
        if (copy.lastRun?.status === "running") return { ...copy.lastRun };
        const started = now();
        const run: CopyRun = { ...finishedRun(nextId("run"), "manual", me.id, started), status: "running", finishedAt: null, boardsRead: 0, apiCalls: 0, totals: null };
        copy.lastRun = run;
        log({ id: nextId("a"), at: iso(started), byUserId: me.id, action: "monday-copy" });
        // A few seconds later it's done, like a real copy.
        setTimeout(() => {
          const done = finishedRun(run.id, "manual", me.id, started);
          done.finishedAt = iso(now());
          copy.lastRun = done;
          copy.lastCopiedAt = done.finishedAt;
          copy.boards = copy.boards.map((board) => ({ ...board, copiedAt: done.finishedAt }));
        }, 4_000);
        return { ...run };
      },
    },
  };
}
