import type { HolidayKey } from "../lib/holidays";

export type Role = "admin" | "office" | "sales";
export type LeadStatus = "new" | "talking" | "details-sent" | "registered" | "not-relevant";
export type LeadSource = "landing-page" | "instagram" | "facebook" | "whatsapp" | "referral";

export interface StaffUser {
  id: string;
  name: string;
  initial: string;
  role: Role;
  passportAccess: boolean;
}

export interface Session {
  userId: string;
  signedInAt: string;
}

export interface LeadEvent {
  id: string;
  at: string;
  text: string;
  byUserId: string | null;
  /** On events that came over in the Monday.com import: the board they came from, e.g. "פולין". */
  mondayBoard: string | null;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  groupId: string | null;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  lastNote: string;
  /** Leads from past trips are archived and never show in the pipeline. */
  archived: boolean;
  /** Newest first. */
  history: LeadEvent[];
}

export interface Passport {
  number: string;
  birthDate: string;
  issueDate: string;
  expiryDate: string;
  nationality: string;
  receivedVia: "whatsapp" | "monday" | "manual";
  receivedAt: string;
  photoAvailable: boolean;
}

export type PassportSource = Passport["receivedVia"];

export interface Note {
  id: string;
  at: string;
  text: string;
  byUserId: string;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  whatsappConnected: boolean;
  groupIds: string[];
  source: LeadSource;
  assigneeId: string | null;
  since: string;
  updatedAt: string;
  passport: Passport | null;
  /** Newest first. */
  notes: Note[];
  /** The lead this customer came from, when it is in the dashboard. */
  leadId: string | null;
  /** The Monday.com board the card was imported from, e.g. "פולין". Null for customers who came in after the import. */
  mondayBoard: string | null;
}

export type IntakeResult = "matched" | "new-card" | "needs-review";

export interface PassportIntake {
  id: string;
  name: string;
  phone: string;
  receivedAt: string;
  result: IntakeResult;
  reason: string;
  customerId: string | null;
}

/** One flight of a trip. Date and time are the local departure time at the origin, as on the ticket. */
export interface FlightLeg {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  /** Place names as the office writes them, e.g. "נתב״ג". */
  from: string;
  to: string;
}

/** Travel details of a trip. Every field is null until the real details exist; screens show a placeholder then. */
export interface Flight {
  outbound: FlightLeg | null;
  /** The flight home. */
  inbound: FlightLeg | null;
  airline: string | null;
  hotel: string | null;
  /** Who guides the group. */
  guide: string | null;
}

export interface Group {
  id: string;
  name: string;
  /** The name where space is tight, e.g. "אומן · ט״ו באב" for "אומן · ט״ו באב תשפ״ז". */
  shortName: string;
  type: "flight" | "event";
  womenOnly: boolean;
  capacity: number;
  startsOn: string;
  endsOn: string | null;
  /** Shown instead of exact dates while they are not fixed. */
  dateLabel: string | null;
  /** Null for events, which have no travel. */
  flight: Flight | null;
}

export interface GroupSummary extends Group {
  registered: number;
  passportsReceived: number;
  /** registered − passportsReceived. */
  missingPassports: number;
  /** Flight readiness: the share of participants whose passport is in, 0–100, rounded. Null for events, which need no passports. */
  readiness: number | null;
}

export interface GroupParticipant {
  customerId: string;
  firstName: string;
  lastName: string;
  phone: string;
  passport: "received" | "missing";
  /** YYYY-MM-DD, or null while the passport is missing. */
  passportExpiry: string | null;
  /** The passport expires within EXPIRING_WITHIN_DAYS of today. */
  passportExpiringSoon: boolean;
  /** The office's note for this trip, e.g. "חדר קרוב למעלית". */
  note: string | null;
}

/** A note about one participant on one trip (stored in the mock database). */
export interface ParticipantNote {
  groupId: string;
  customerId: string;
  text: string;
}

export type ActivityKind = "passport" | "lead" | "greeting" | "birthday" | "import";

export interface Activity {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string;
}

export interface WeeklyCount {
  weekStart: string;
  count: number;
}

export interface OverviewStats {
  openLeads: number;
  customers: number;
  activeGroups: number;
  newLeadsThisWeek: number;
  newLeadsLastWeek: number;
  thisWeekByStatus: { new: number; talking: number; registered: number };
  /** Oldest first, ending with this week. */
  weeklyLeads: WeeklyCount[];
}

// ---- Messages to customers ----

export type MessageKind = "holiday" | "birthday";

/**
 * Where a WhatsApp message stands. "delivered" means delivered and not read yet.
 * "awaiting-approval" belongs to a holiday greeting nobody approved yet; "paused" to a birthday while the automation is off.
 */
export type DeliveryStatus = "awaiting-approval" | "scheduled" | "paused" | "sent" | "delivered" | "read" | "failed";

export type DeliveryFailure = "invalid-number" | "blocked";

export interface CustomerMessage {
  id: string;
  customerId: string;
  kind: MessageKind;
  /** Holiday greetings only. */
  holiday: HolidayKey | null;
  hebrewYear: number | null;
  campaignId: string | null;
  /** When it went out, or when it is due to. */
  at: string;
  status: DeliveryStatus;
  failure: DeliveryFailure | null;
}

// ---- Holiday greetings ----

/** The four steps of a greeting, in order. */
export const CAMPAIGN_STAGES = ["write", "review", "approve", "track"] as const;
export type CampaignStage = (typeof CAMPAIGN_STAGES)[number];

export type CampaignStatus = "draft" | "awaiting-approval" | "scheduled" | "sending" | "completed";

export interface SendRate {
  messages: number;
  everyMinutes: number;
}

/** Who a greeting goes to. */
export interface Audience {
  id: string;
  /** "all" is every customer; "groups" is everyone registered to the groups in groupIds. */
  kind: "all" | "groups";
  /** The name Ronit uses, e.g. "פולין · נובמבר". Null for "all", which the screen names. */
  name: string | null;
  /** For tight spaces, e.g. "פולין". */
  shortName: string | null;
  groupIds: string[];
}

export interface AudienceOption extends Audience {
  recipients: number;
}

/** Counts after sending. delivered includes read; failed = sent − delivered. */
export interface CampaignStats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

/** The customer the WhatsApp preview is shown for. */
export interface CampaignPreview {
  customerId: string;
  firstName: string;
  lastName: string;
  groupName: string | null;
}

export interface HolidayCampaign {
  id: string;
  holiday: HolidayKey;
  /** 5787; the screen writes it as תשפ״ז. */
  hebrewYear: number;
  stage: CampaignStage;
  status: CampaignStatus;
  /** The evening the holiday starts, YYYY-MM-DD. Greetings go out then. */
  eve: string;
  /** When sending starts. */
  sendAt: string;
  /** The text, with tokens from MESSAGE_TOKENS (src/data/messages.ts). */
  message: string;
  audienceId: string;
  recipients: number;
  rate: SendRate;
  /** How long sending takes at the rate. */
  estimatedMinutes: number;
  /** Null for past greetings. */
  preview: CampaignPreview | null;
  savedAt: string;
  savedByUserId: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  /** The last "send a test to me". */
  lastTest: { at: string; toUserId: string } | null;
  /** Null until sending starts. */
  stats: CampaignStats | null;
}

// ---- Birthdays ----

/** What happens to a birthday that falls on Shabbat: wait until it ends, or go out on Friday. */
export type ShabbatRule = "after-shabbat" | "before-shabbat";

export interface BirthdaySettings {
  enabled: boolean;
  /** HH:mm, Israel time. */
  sendTime: string;
  channel: "whatsapp";
  /** Where birth dates come from. */
  birthDateSource: "passport";
  shabbatRule: ShabbatRule;
  /** The greeting, with tokens from MESSAGE_TOKENS. */
  template: string;
  templateUpdatedAt: string;
}

/** One person's birthday and its greeting. */
export interface BirthdayEntry {
  customerId: string;
  firstName: string;
  lastName: string;
  /** The birthday, YYYY-MM-DD. */
  day: string;
  /** The age turned that day. */
  age: number;
  /** When the greeting went out, or goes out. */
  sendAt: string;
  /** The birthday falls on Shabbat, so the greeting moves by the Shabbat rule. */
  onShabbat: boolean;
  status: DeliveryStatus;
  failure: DeliveryFailure | null;
}

export interface BirthdaysOverview {
  today: BirthdayEntry[];
  /** The next seven days after today, soonest first. */
  upcoming: BirthdayEntry[];
  /** The latest greetings that went out, newest first. */
  recent: BirthdayEntry[];
  /** Greetings sent this calendar year, failures not counted. */
  sentThisYear: number;
}

// ---- Users and access ----

export type TwoStepStatus = "active" | "not-set";

export interface UserAccount extends StaffUser {
  email: string;
  /** Null until the first sign-in. */
  lastSignInAt: string | null;
  twoStep: TwoStepStatus;
}

/** Someone invited who has not signed in yet. */
export interface UserInvite {
  id: string;
  email: string;
  role: Role;
  passportAccess: boolean;
  sentAt: string;
  sentByUserId: string;
}

export interface UserDirectory {
  users: UserAccount[];
  invites: UserInvite[];
}

export type PermissionArea = "leads" | "customers" | "passports" | "greetings" | "import" | "users";
export type AccessLevel = "full" | "view" | "none";

export interface PermissionRow {
  area: PermissionArea;
  access: Record<Role, AccessLevel>;
}

/** Rows in display order. */
export type PermissionMatrix = PermissionRow[];

/** The security switches, in display order. */
export const SECURITY_SWITCHES = ["twoStepRequired", "maskPassportNumbers", "autoSignOut", "passportAccessLog"] as const;
export type SecuritySwitch = (typeof SECURITY_SWITCHES)[number];

export type SecuritySettings = Record<SecuritySwitch, boolean> & {
  /** Minutes without activity before the automatic sign-out. */
  autoSignOutMinutes: number;
};

interface AuditBase {
  id: string;
  at: string;
  /** Who did it. Null for automatic actions. */
  byUserId: string | null;
}

/** One sensitive action. Each kind carries what its line needs; switch on `action`. */
export type AuditEntry = AuditBase &
  (
    | { action: "passport-view" | "passport-photo-view"; customerId: string; customerName: string }
    | { action: "passport-received"; customerId: string; customerName: string; via: PassportSource }
    | { action: "greeting-edit" | "greeting-approve"; campaignId: string; holiday: HolidayKey }
    | { action: "role-change"; userId: string; userName: string; role: Role }
    | { action: "new-device-sign-in" }
    | { action: "security-change"; setting: SecuritySwitch; enabled: boolean }
    | { action: "monday-close"; runId: string }
  );

export type AuditAction = AuditEntry["action"];

/** The entries about one customer's passport. */
export type PassportAccessEntry = Extract<AuditEntry, { customerId: string }>;

// ---- Monday.com import ----

export type ImportStepKey = "connect" | "boards" | "fields" | "duplicates" | "import";
export type StepState = "done" | "current" | "pending";

export interface ImportStep {
  key: ImportStepKey;
  state: StepState;
  completedAt: string | null;
}

export interface MondayBoard {
  id: string;
  /** As named in Monday.com, e.g. "CRM כללי". */
  name: string;
  /** Monday groups on the board. */
  groups: number;
  items: number;
  selected: boolean;
}

/** Where a Monday column lands in the dashboard. */
export type ImportField = "fullName" | "phone" | "source" | "group" | "status" | "notes";

export interface FieldMapping {
  /** The column as named in Monday.com, e.g. "עדכונים". */
  mondayColumn: string;
  field: ImportField;
  check: "ok" | "warning" | "error";
}

export interface ImportTotals {
  itemsFound: number;
  leadsImported: number;
  duplicatesMerged: number;
  notesSaved: number;
  errors: number;
}

export interface ImportRun {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  boards: MondayBoard[];
  /** In order. */
  steps: ImportStep[];
  fields: FieldMapping[];
  totals: ImportTotals;
  /** How duplicates were matched. */
  duplicatesBy: "phone";
  /** Monday stays read-only until Ronit confirms everything came over, then it is closed. */
  monday: "read-only" | "closed";
  mondayClosedAt: string | null;
  mondayClosedByUserId: string | null;
}

// ---- The mock store ----

export interface Database {
  users: UserAccount[];
  invites: UserInvite[];
  leads: Lead[];
  customers: Customer[];
  intakes: PassportIntake[];
  groups: Group[];
  participantNotes: ParticipantNote[];
  activity: Activity[];
  campaigns: HolidayCampaign[];
  audiences: Audience[];
  /** Messages that went out (or are due) to customers. The pending holiday greeting is not stored per customer. */
  messages: CustomerMessage[];
  birthdaySettings: BirthdaySettings;
  permissions: PermissionMatrix;
  security: SecuritySettings;
  /** Sensitive actions by staff. Passport arrivals are read off the passport itself. */
  audit: AuditEntry[];
  importRun: ImportRun;
}
