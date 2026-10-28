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
  notes: Note[];
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

export interface Group {
  id: string;
  name: string;
  type: "flight" | "event";
  womenOnly: boolean;
  capacity: number;
  startsOn: string;
  endsOn: string | null;
  /** Shown instead of exact dates while they are not fixed. */
  dateLabel: string | null;
}

export interface GroupSummary extends Group {
  registered: number;
  passportsReceived: number;
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

export interface Database {
  users: StaffUser[];
  leads: Lead[];
  customers: Customer[];
  intakes: PassportIntake[];
  groups: Group[];
  activity: Activity[];
}
