import type { Activity, Customer, GroupSummary, Lead, LeadSource, LeadStatus, OverviewStats, PassportIntake, Session, StaffUser } from "./types";

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
}

export interface GroupsService {
  list(): Promise<GroupSummary[]>;
  get(id: string): Promise<GroupSummary>;
}

export interface OverviewService {
  stats(): Promise<OverviewStats>;
  /** Newest first. */
  activity(): Promise<Activity[]>;
}

/** Everything the screens may ask of the backend. The mock implements it today; Ronit's API will later. */
export interface Services {
  session: SessionService;
  leads: LeadsService;
  customers: CustomersService;
  groups: GroupsService;
  overview: OverviewService;
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
