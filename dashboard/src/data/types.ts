import type { HolidayKey } from "../lib/holidays";

export type Role = "admin" | "office" | "sales";
/** "no-answer" is Monday's "אין מענה": called, and nobody answered yet. */
export type LeadStatus = "new" | "no-answer" | "talking" | "details-sent" | "registered" | "not-relevant";
export type LeadSource = "landing-page" | "instagram" | "facebook" | "whatsapp" | "referral";
/** What the lead asked about, from Monday's "שירות". Monday doesn't say which trip. */
export type LeadService = "uman" | "challah";

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

/** A note on a lead: in Monday, an "update" the team wrote or a call summary. */
export interface LeadEvent {
  id: string;
  at: string;
  text: string;
  /** A dashboard user; null for notes written in Monday. */
  byUserId: string | null;
  /** Who wrote it in Monday, as Monday names them. */
  author: string | null;
  /** The Monday board the note is on. */
  mondayBoard: string | null;
}

/**
 * A lead, as copied from Monday's CRM board. Read-only here: the team edits leads in Monday until
 * the switch-over, and every lead links back to its row there.
 */
export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  service: LeadService | null;
  /** Empty for leads from Monday, which doesn't say which trip or which dashboard user. */
  groupId: string | null;
  assigneeId: string | null;
  /** The Monday board and group the lead sits in, e.g. "פולואפ" or "לידים נווה" (often the agent's name). */
  mondayBoard: string;
  mondayGroup: string;
  /** The lead's row in Monday. */
  mondayUrl: string;
  createdAt: string;
  updatedAt: string;
  lastNote: string;
  /** Leads from the old CRM board: found by search, never in the pipeline. */
  archived: boolean;
  /** Calls made, from Salestrail through Monday. */
  calls: number;
  lastCallOn: string | null;
  inquiryOn: string | null;
  /** The last Instagram message, for leads that wrote on Instagram. */
  lastMessage: string | null;
  /** Monday's "שלב הבא": what the team said comes next. */
  nextStep: string | null;
  /** Newest first. Empty in lists. */
  history: LeadEvent[];
}

/** How many leads came in on one day: by Monday's "תאריך פנייה", or else the day the row was made. */
export interface LeadDay {
  /** YYYY-MM-DD, in Israel. */
  day: string;
  count: number;
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

/** Monday's own passport column on a trip ("יש" / "בהנפקה"), shown while no passport is on file. */
export type MondayPassport = "yes" | "in-progress";

/** Customers from Monday's trip boards have no lead source of their own unless a lead had their phone. */
export type CustomerSource = LeadSource | "monday" | "manual";

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
  source: CustomerSource;
  assigneeId: string | null;
  since: string;
  updatedAt: string;
  /** Null without one, and for people without passport access. */
  passport: Passport | null;
  mondayPassport: MondayPassport | null;
  /** Newest first. */
  notes: Note[];
  /** The lead this customer came from, when it is in the dashboard. */
  leadId: string | null;
  /** The Monday board of her newest row there, e.g. "טיסה טו באב 26". */
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
  /** Null when nobody set one (Monday has none). */
  capacity: number | null;
  /** Null while the trip has no date. */
  startsOn: string | null;
  endsOn: string | null;
  /** Shown instead of exact dates while they are not fixed, or for a whole month ("נובמבר 2026"). */
  dateLabel: string | null;
  /** Null for events, which have no travel. */
  flight: Flight | null;
  /** The Monday board it's copied from. */
  mondayBoard: string | null;
}

export interface GroupSummary extends Group {
  registered: number;
  /** A passport on file, or Monday's "יש". */
  passportsReceived: number;
  /** registered − passportsReceived. */
  missingPassports: number;
  /** Flight readiness: the share of participants whose passport is in, 0–100, rounded. Null for events, which need no passports. */
  readiness: number | null;
}

export interface GroupParticipant {
  /** The row: a seat on a flight, a booking in a challah month. The same person can have two. */
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
  phone: string;
  passport: "received" | "missing";
  /** YYYY-MM-DD, or null while the passport is missing. */
  passportExpiry: string | null;
  /** The passport expires within EXPIRING_WITHIN_DAYS of today. */
  passportExpiringSoon: boolean;
  /** The office's note for this trip, e.g. "חדר: לבד", or a challah booking's type and city. */
  note: string | null;
  mondayPassport: MondayPassport | null;
  /** Monday's own status for her on a flight: תשלום חלקי, נסגר, צוות… */
  mondayStatus: string | null;
  /** A challah booking's date. */
  eventOn: string | null;
}

/** One line of the activity feed; the screen words each kind. */
export type Activity = { id: string; at: string } & (
  | { kind: "lead"; name: string; source: LeadSource; service: LeadService | null }
  | { kind: "registration"; name: string; group: string }
  | { kind: "passport"; name: string; result: IntakeResult }
  | { kind: "import"; leads: number; customers: number }
);

export type ActivityKind = Activity["kind"];

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

/** "in-review": the text is with WhatsApp (Meta reviews every greeting template) before Ronit approves it. */
export type CampaignStatus = "draft" | "in-review" | "awaiting-approval" | "scheduled" | "sending" | "completed";

/** Meta's verdict on a greeting's text, as Zernio passes it on. Only APPROVED can be sent. */
export type TemplateStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED" | "IN_APPEAL" | "PENDING_DELETION";

export interface TemplateReview {
  status: TemplateStatus;
  /** Meta's reason, when it refused the text. */
  reason: string | null;
}

/** How the WhatsApp connection (Zernio) stands. */
export interface WhatsAppStatus {
  /** Greetings can go for WhatsApp's review, and tests go out. */
  connected: boolean;
  /** Approved greetings actually go out to customers. */
  sending: boolean;
}

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
  /** The text's WhatsApp template, once it went for review. */
  template: TemplateReview | null;
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
  /** The text WhatsApp approved, which is what goes out. Null until one is approved. */
  approvedTemplate: string | null;
  /** A newer text in WhatsApp's review, or refused there. */
  templateReview: TemplateReview | null;
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
  /** Their own WhatsApp number for test greetings ("050…"), on their own account only; "" when not set. */
  whatsappPhone: string;
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

/** What a role may do in one area. Admins change it on the users screen, except the fixed cells. */
export interface PermissionRow {
  area: PermissionArea;
  access: Record<Role, AccessLevel>;
  /** The roles whose cell can't change: admins (always full), sales on passports, and everyone on users. */
  fixed: Role[];
}

/** Rows in display order. */
export type PermissionMatrix = PermissionRow[];

/** The signed-in person's level in each area. */
export type StaffAccess = Record<PermissionArea, AccessLevel>;

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
    /** A test greeting, and the number it went to ("050…"). */
    | { action: "greeting-test"; campaignId: string; holiday: HolidayKey; to: string }
    /** Someone set their WhatsApp number for tests; "" when they cleared it. */
    | { action: "staff-phone-changed"; userId: string; userName: string; phone: string }
    | { action: "security-change"; setting: SecuritySwitch; enabled: boolean }
    /** A sign-in from a new device; an account locked after wrong codes; a copy from Monday asked for now. */
    | { action: "new-device-sign-in" | "sign-in-locked" | "monday-copy" }
    | { action: "staff-invited" | "staff-removed"; userId: string; userName: string }
    /** Someone's role or passport access changed: what they have now. */
    | { action: "staff-access-changed"; userId: string; userName: string; role: Role; passportAccess: boolean }
    /** A cell of the role table changed: what the role has now in that area. */
    | { action: "permission-change"; role: Role; area: PermissionArea; access: AccessLevel }
    /** A Google account that isn't registered tried to sign in. */
    | { action: "sign-in-refused"; email: string }
  );

export type AuditAction = AuditEntry["action"];

/** The entries about one customer's passport. */
export type PassportAccessEntry = Extract<AuditEntry, { customerId: string }>;

// ---- The copy from Monday ----

export type BoardKind = "crm" | "crm-archive" | "flight" | "challah";

export interface CopiedBoard {
  id: string;
  /** As named in Monday.com, e.g. "רונית - CRM". */
  name: string;
  kind: BoardKind;
  items: number;
  groups: number;
  copiedAt: string | null;
}

export interface CopyTotals {
  /** Rows on the boards the copy reads. */
  itemsFound: number;
  /** Leads from the live CRM board, every status. */
  leads: number;
  archivedLeads: number;
  /** CRM rows without a phone: Instagram chats that never left a number. */
  withoutPhone: number;
  customers: number;
  /** Trips and challah months. */
  groups: number;
  /** Rows that joined a customer already there (the same phone on another board). */
  duplicatesMerged: number;
  notes: number;
}

export type CopyStatus = "running" | "completed" | "failed" | "skipped";

export interface CopyRun {
  id: string;
  trigger: "schedule" | "startup" | "manual";
  byUserId: string | null;
  status: CopyStatus;
  startedAt: string;
  finishedAt: string | null;
  boardsRead: number;
  apiCalls: number;
  totals: CopyTotals | null;
  error: string | null;
}

/** How the copy from Monday stands. Monday stays the team's tool until the switch-over. */
export interface MondayCopy {
  /** Copies on the schedule; "sync now" needs it too. */
  enabled: boolean;
  /** The latest run, whatever happened to it. */
  lastRun: CopyRun | null;
  /** When the dashboard's data was last brought up to date. */
  lastCopiedAt: string | null;
  nextRunAt: string | null;
  boards: CopiedBoard[];
  totals: CopyTotals;
}
