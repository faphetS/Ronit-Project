import type {
  Activity,
  AudienceOption,
  AuditEntry,
  BirthdaySettings,
  BirthdaysOverview,
  Customer,
  CustomerMessage,
  GroupParticipant,
  GroupSummary,
  HolidayCampaign,
  ImportRun,
  Lead,
  LeadSource,
  LeadStatus,
  OverviewStats,
  PassportAccessEntry,
  PassportIntake,
  PermissionMatrix,
  SecuritySettings,
  SecuritySwitch,
  Session,
  StaffUser,
  UserAccount,
  UserDirectory,
} from "./types";

export type LeadStatusFilter = LeadStatus | "all";

export interface LeadFilters {
  status?: LeadStatusFilter;
  groupId?: string;
  source?: LeadSource;
  assigneeId?: string;
  /** Matches the name, or digits in the phone number. */
  search?: string;
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

/** Fields of the current greeting that can be edited. */
export interface CampaignPatch {
  message?: string;
  audienceId?: string;
}

export type BirthdaySettingsPatch = Partial<Pick<BirthdaySettings, "enabled" | "sendTime" | "shabbatRule" | "template">>;

export interface SessionService {
  current(): Promise<SignedIn | null>;
  signIn(email: string, password: string): Promise<SignedIn>;
  signOut(): Promise<void>;
}

export interface LeadsService {
  /** The open pipeline, newest update first. */
  list(filters?: LeadFilters): Promise<Lead[]>;
  counts(): Promise<LeadCounts>;
  get(id: string): Promise<Lead>;
  updateStatus(id: string, status: LeadStatus): Promise<Lead>;
  addNote(id: string, text: string): Promise<Lead>;
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
  /** Records that the signed-in user opened the passport. Null when the access log is switched off. */
  logPassportView(id: string, part: PassportPart): Promise<PassportAccessEntry | null>;
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

/** The signed-in user's own details that they can change. */
export interface ProfilePatch {
  name?: string;
  email?: string;
}

export interface UsersService {
  list(): Promise<UserDirectory>;
  /** Changes the signed-in user's own name or email. */
  updateProfile(patch: ProfilePatch): Promise<UserAccount>;
  permissions(): Promise<PermissionMatrix>;
  security(): Promise<SecuritySettings>;
  updateSecurity(key: SecuritySwitch, enabled: boolean): Promise<SecuritySettings>;
  /** Sensitive actions by staff, newest first. */
  audit(): Promise<AuditEntry[]>;
}

export interface ImportsService {
  /** The Monday.com import. */
  latest(): Promise<ImportRun>;
  /** Confirms everything came over and closes the Monday boards. */
  closeMonday(id: string): Promise<ImportRun>;
}

/** Everything the screens may ask of the backend. The mock implements it today; Ronit's API will later. */
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

export class ServiceUnavailableError extends Error {
  constructor(service: ServiceName) {
    super(`The ${service} service is unavailable`);
    this.name = "ServiceUnavailableError";
  }
}
