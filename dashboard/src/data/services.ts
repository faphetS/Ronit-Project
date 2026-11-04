import type {
  AccessLevel,
  Activity,
  AudienceOption,
  AuditEntry,
  BirthdaySettings,
  BirthdaysOverview,
  CopyRun,
  Customer,
  CustomerMessage,
  GroupParticipant,
  GroupSummary,
  HolidayCampaign,
  Lead,
  LeadDay,
  LeadService,
  LeadSource,
  LeadStatus,
  MondayCopy,
  OverviewStats,
  PassportAccessEntry,
  PassportIntake,
  PermissionArea,
  PermissionMatrix,
  Role,
  SecuritySettings,
  SecuritySwitch,
  Session,
  StaffUser,
  UserAccount,
  UserDirectory,
  UserInvite,
  WhatsAppStatus,
} from "./types";

export type LeadStatusFilter = LeadStatus | "all";

export interface LeadFilters {
  status?: LeadStatusFilter;
  service?: LeadService;
  source?: LeadSource;
  /** Matches the name, or digits in the phone number. A search also finds archived leads. */
  search?: string;
  /** Only the leads that came in on this day (YYYY-MM-DD in Israel), archived ones too. */
  day?: string;
}

export type LeadCounts = Record<LeadStatusFilter, number>;

export type CustomerFilter = "all" | "whatsapp-today" | "expiring" | "missing-passport";

/** How many customers each filter matches, plus how many have a passport on file. */
export type CustomerCounts = Record<CustomerFilter, number> & { withPassport: number };

export interface CustomerQuery {
  filter?: CustomerFilter;
  /** Matches the name, or digits in the phone or passport number. */
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SignedIn {
  session: Session;
  user: StaffUser;
}

/** What a passport view revealed: the fields, or the photo behind "הצגה". */
export type PassportPart = "details" | "photo";

/** A logged passport view: the log line (null while the access log is off), and the full number for "details". */
export interface PassportReveal {
  entry: PassportAccessEntry | null;
  number: string | null;
}

/** Fields of the current greeting that can be edited. */
export interface CampaignPatch {
  message?: string;
  audienceId?: string;
}

export type BirthdaySettingsPatch = Partial<Pick<BirthdaySettings, "enabled" | "sendTime" | "shabbatRule" | "template">>;

/** Where "Continue with Google" leads: Google itself, through the API. Test services may go straight to the code. */
export type GoogleStart = { redirectTo: string } | { step: "code-required" };

/** What Google's own button led to: signed in on a remembered device, or the emailed code is next. */
export type GoogleCredentialResult = { step: "signed-in"; signedIn: SignedIn; returnTo: string } | { step: "code-required" };

/** The code waiting after Google: where it was emailed, partly hidden (r***@gmail.com). */
export interface PendingCode {
  email: string;
}

export const SIGN_IN_ERRORS = [
  "not-registered",
  "google-failed",
  "too-many-attempts",
  "invalid-code",
  "step-expired",
  "email-failed",
  "resend-too-soon",
  "unavailable",
] as const;
export type SignInErrorCode = (typeof SIGN_IN_ERRORS)[number];

/** A sign-in refusal the screens put in words. Anything else reads as "couldn't sign in". */
export class SignInError extends Error {
  constructor(readonly code: SignInErrorCode) {
    super(code);
    this.name = "SignInError";
  }
}

export interface SessionService {
  current(): Promise<SignedIn | null>;
  /** Starts "Continue with Google" by redirect: the fallback when Google's own button can't load. */
  startGoogle(options: { remember: boolean; returnTo: string }): Promise<GoogleStart>;
  /** For Google's own button: the one-time value Google puts in its answer, checked by the server. */
  googleNonce(): Promise<string>;
  /** The answer (an ID token) Google's own button hands over. `returnTo` is the page to land on. */
  googleCredential(credential: string, options: { remember: boolean; returnTo: string }): Promise<GoogleCredentialResult>;
  /** The emailed code waiting after Google, or null when there's none. */
  pendingCode(): Promise<PendingCode | null>;
  resendCode(): Promise<void>;
  /** The 6-digit code from the email. */
  verifyCode(code: string): Promise<{ signedIn: SignedIn; returnTo: string }>;
  signOut(): Promise<void>;
}

/** Leads are copied from Monday and edited there until the switch-over, so this only reads. */
export interface LeadsService {
  /** The open pipeline, newest Monday update first. */
  list(filters?: LeadFilters): Promise<Lead[]>;
  counts(): Promise<LeadCounts>;
  /** How many leads came in on each day, oldest first; days without leads are left out. */
  days(): Promise<LeadDay[]>;
  /** With its Monday notes. */
  get(id: string): Promise<Lead>;
}

export interface CustomersService {
  list(query?: CustomerQuery): Promise<Page<Customer>>;
  get(id: string): Promise<Customer>;
  /** Passports that arrived on WhatsApp, newest first. */
  intakes(): Promise<PassportIntake[]>;
  counts(): Promise<CustomerCounts>;
  /** Greetings sent to the customer, and the ones due, newest first. */
  messages(id: string): Promise<CustomerMessage[]>;
  /** Who saw or changed the customer's passport, newest first. */
  accessLog(id: string): Promise<PassportAccessEntry[]>;
  /** Adds an internal note by the signed-in user. */
  addNote(id: string, text: string): Promise<Customer>;
  /** Records that the signed-in user opened the passport, and returns the full number for "details". */
  logPassportView(id: string, part: PassportPart): Promise<PassportReveal>;
}

export interface GroupsService {
  /** By start date. */
  list(): Promise<GroupSummary[]>;
  get(id: string): Promise<GroupSummary>;
  /** Everyone registered, with their passport status. */
  participants(id: string): Promise<GroupParticipant[]>;
}

export interface OverviewService {
  stats(): Promise<OverviewStats>;
  /** Newest first. */
  activity(): Promise<Activity[]>;
}

export interface GreetingsService {
  /** The next holiday greeting that has not gone out yet, or null. */
  current(): Promise<HolidayCampaign | null>;
  /** Starts the greeting for the next holiday that has none, as an empty draft. */
  create(): Promise<HolidayCampaign>;
  /** Sends the text to WhatsApp for review; Ronit approves it once WhatsApp has. */
  submit(id: string): Promise<HolidayCampaign>;
  /** Whether WhatsApp is connected, and whether greetings go out. */
  whatsapp(): Promise<WhatsAppStatus>;
  /** Every greeting, the current one included, newest first. */
  history(): Promise<HolidayCampaign[]>;
  /** Who a greeting can go to, with recipient counts. */
  audiences(): Promise<AudienceOption[]>;
  /** Saves the text or the audience. Editing an approved greeting sends it back for approval. */
  update(id: string, patch: CampaignPatch): Promise<HolidayCampaign>;
  approve(id: string): Promise<HolidayCampaign>;
  /** Sends the greeting to the signed-in user's WhatsApp. */
  sendTest(id: string): Promise<HolidayCampaign>;
}

export interface BirthdaysService {
  settings(): Promise<BirthdaySettings>;
  /** Today, the coming week, recent sends and the count for the year. */
  overview(): Promise<BirthdaysOverview>;
  updateSettings(patch: BirthdaySettingsPatch): Promise<BirthdaySettings>;
}

/** The signed-in user's own name. The email is the Google account they sign in with, so it can't change here. */
export interface ProfilePatch {
  name: string;
  /** For test greetings; "" clears it. */
  whatsappPhone?: string;
}

/** A person's role and their own passport access. */
export interface AccessInput {
  role: Role;
  /** Never for sales. */
  passportAccess: boolean;
}

/** Someone to give an account: they sign in with the Google account of this email. */
export interface InviteInput extends AccessInput {
  email: string;
  name: string;
}

/** One cell of the role table: what `role` may now do in `area`. */
export interface PermissionChange {
  role: Role;
  area: PermissionArea;
  access: AccessLevel;
}

export interface UsersService {
  list(): Promise<UserDirectory>;
  /** Changes the signed-in user's own name. */
  updateProfile(patch: ProfilePatch): Promise<UserAccount>;
  permissions(): Promise<PermissionMatrix>;
  /** Changes what a role may do in one area; answers with the whole table. */
  changePermission(change: PermissionChange): Promise<PermissionMatrix>;
  /** Changes someone's role and passport access, or a pending invite's; answers with the team as it now stands. */
  changeAccess(userId: string, input: AccessInput): Promise<UserDirectory>;
  security(): Promise<SecuritySettings>;
  updateSecurity(key: SecuritySwitch, enabled: boolean): Promise<SecuritySettings>;
  /** Sensitive actions, newest first. */
  audit(): Promise<AuditEntry[]>;
  /** Registers the account and emails the invite. `emailed` is false when the email didn't go out. */
  invite(input: InviteInput): Promise<{ invite: UserInvite; emailed: boolean }>;
  /** Closes the account and signs them out everywhere. */
  remove(userId: string): Promise<void>;
}

export interface ImportsService {
  /** How the copy from Monday stands. */
  latest(): Promise<MondayCopy>;
  /** Copies from Monday now, in the background: the run comes back while it's still running. */
  copyNow(): Promise<CopyRun>;
}

/** Everything the screens ask of Ronit's API (src/data/http). */
export interface Services {
  session: SessionService;
  leads: LeadsService;
  customers: CustomersService;
  groups: GroupsService;
  overview: OverviewService;
  greetings: GreetingsService;
  birthdays: BirthdaysService;
  users: UsersService;
  imports: ImportsService;
}

export type ServiceName = keyof Services;

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} not found`);
    this.name = "NotFoundError";
  }
}

