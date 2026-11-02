import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { now } from "../lib/clock";
import { estimateSendMinutes } from "./rules";
import type { BirthdaySettingsPatch, CampaignPatch, CustomerQuery, LeadFilters, PassportPart, ProfilePatch, SignedIn } from "./services";
import { useServices } from "./services-context";
import type { AudienceOption, BirthdaySettings, Customer, HolidayCampaign, ImportRun, Lead, LeadStatus, SecuritySettings, SecuritySwitch } from "./types";

export const queryKeys = {
  session: ["session"] as const,
  setupLink: (token: string) => ["setup-link", token] as const,
  leads: (filters: LeadFilters) => ["leads", "list", filters] as const,
  leadCounts: ["leads", "counts"] as const,
  lead: (id: string) => ["leads", "detail", id] as const,
  customers: (query: CustomerQuery) => ["customers", "list", query] as const,
  customerCounts: ["customers", "counts"] as const,
  customer: (id: string) => ["customers", "detail", id] as const,
  customerMessages: (id: string) => ["customers", "messages", id] as const,
  passportAccess: (id: string) => ["customers", "access", id] as const,
  intakes: ["customers", "intakes"] as const,
  groups: ["groups"] as const,
  group: (id: string) => ["groups", "detail", id] as const,
  groupParticipants: (id: string) => ["groups", "participants", id] as const,
  overview: ["overview", "stats"] as const,
  activity: ["overview", "activity"] as const,
  campaign: ["greetings", "current"] as const,
  campaignHistory: ["greetings", "history"] as const,
  audiences: ["greetings", "audiences"] as const,
  birthdaySettings: ["birthdays", "settings"] as const,
  birthdays: ["birthdays", "overview"] as const,
  users: ["users", "list"] as const,
  permissions: ["users", "permissions"] as const,
  security: ["users", "security"] as const,
  audit: ["users", "audit"] as const,
  importRun: ["imports", "latest"] as const,
};

interface Snapshot<T> {
  key: QueryKey;
  previous: T | undefined;
}

/** Applies `change` to the cached value right away and keeps the old value for rollBack. */
async function changeCached<T>(client: QueryClient, key: QueryKey, change: (value: T) => T): Promise<Snapshot<T>> {
  await client.cancelQueries({ queryKey: key, exact: true });
  const previous = client.getQueryData<T>(key);
  if (previous !== undefined) client.setQueryData<T>(key, change(previous));
  return { key, previous };
}

function rollBack<T>(client: QueryClient, snapshot: Snapshot<T> | undefined): void {
  if (snapshot?.previous !== undefined) client.setQueryData(snapshot.key, snapshot.previous);
}

function signedInUserId(client: QueryClient): string | null {
  return client.getQueryData<SignedIn | null>(queryKeys.session)?.user.id ?? null;
}

/** Leaves out fields set to undefined, so they don't blank the cached value. */
function definedFields<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}

// ---- Session ----

export function useSession() {
  const { session } = useServices();
  return useQuery({ queryKey: queryKeys.session, queryFn: () => session.current() });
}

/** The password step. A "signed-in" answer goes straight into the session cache. */
export function useSignIn() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password, remember }: { email: string; password: string; remember: boolean }) => session.signIn(email, password, remember),
    onSuccess: (step) => {
      if (step.step === "signed-in") client.setQueryData(queryKeys.session, step.signedIn);
    },
  });
}

/** The 6-digit code from the authenticator app. */
export function useVerifyCode() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => session.verifyCode(code),
    onSuccess: (signedIn) => client.setQueryData(queryKeys.session, signedIn),
  });
}

/** Who an invite or reset link is for. A dead link doesn't come back to life, so no retries. */
export function useSetupLink(token: string) {
  const { session } = useServices();
  return useQuery({ queryKey: queryKeys.setupLink(token), queryFn: () => session.setupLink(token), retry: false, staleTime: Infinity });
}

/** The new password from a link, then the same steps as signing in. */
export function useCompleteSetupLink(token: string) {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ password, remember }: { password: string; remember: boolean }) => session.completeSetupLink(token, password, remember),
    onSuccess: (step) => {
      if (step.step === "signed-in") client.setQueryData(queryKeys.session, step.signedIn);
    },
  });
}

export function useSignOut() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => session.signOut(),
    onSuccess: () => {
      client.clear();
      client.setQueryData(queryKeys.session, null);
    },
  });
}

// ---- Leads ----

export function useLeads(filters: LeadFilters = {}) {
  const { leads } = useServices();
  return useQuery({ queryKey: queryKeys.leads(filters), queryFn: () => leads.list(filters) });
}

export function useLeadCounts() {
  const { leads } = useServices();
  return useQuery({ queryKey: queryKeys.leadCounts, queryFn: () => leads.counts() });
}

export function useLead(id: string) {
  const { leads } = useServices();
  return useQuery({ queryKey: queryKeys.lead(id), queryFn: () => leads.get(id) });
}

/** Changes a lead's status on screen right away, rolls back if the call fails, then refreshes lists and counts. */
export function useUpdateLeadStatus() {
  const { leads } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) => leads.updateStatus(id, status),
    onMutate: async ({ id, status }) => {
      await client.cancelQueries({ queryKey: queryKeys.lead(id) });
      const previous = client.getQueryData<Lead>(queryKeys.lead(id));
      if (previous) client.setQueryData<Lead>(queryKeys.lead(id), { ...previous, status });
      return { previous };
    },
    onError: (_error, { id }, context) => {
      if (context?.previous) client.setQueryData(queryKeys.lead(id), context.previous);
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["leads"] });
      await client.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

/** Adds a note: it tops the lead's history right away, rolls back if the call fails, then refreshes the leads. */
export function useAddLeadNote() {
  const { leads } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => leads.addNote(id, text),
    onMutate: ({ id, text }) =>
      changeCached<Lead>(client, queryKeys.lead(id), (lead) => ({
        ...lead,
        lastNote: text,
        history: [{ id: `${id}-pending`, at: now().toISOString(), text, byUserId: signedInUserId(client), mondayBoard: null }, ...lead.history],
      })),
    onError: (_error, _variables, snapshot) => rollBack(client, snapshot),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

// ---- Customers and passports ----

export function useCustomers(query: CustomerQuery = {}) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customers(query), queryFn: () => customers.list(query), placeholderData: keepPreviousData });
}

/** How many customers each filter chip matches, and how many have a passport. */
export function useCustomerCounts() {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customerCounts, queryFn: () => customers.counts() });
}

export function useCustomer(id: string) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customer(id), queryFn: () => customers.get(id) });
}

/** Greetings sent to the customer and the ones due, newest first. */
export function useCustomerMessages(id: string) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customerMessages(id), queryFn: () => customers.messages(id) });
}

/** Who saw or changed the customer's passport, newest first. */
export function usePassportAccessLog(id: string) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.passportAccess(id), queryFn: () => customers.accessLog(id) });
}

export function usePassportIntakes() {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.intakes, queryFn: () => customers.intakes() });
}

/** Adds an internal note: it shows at the top right away, rolls back if the call fails, then refreshes the card and the list. */
export function useAddCustomerNote() {
  const { customers } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => customers.addNote(id, text),
    onMutate: ({ id, text }) =>
      changeCached<Customer>(client, queryKeys.customer(id), (customer) => ({
        ...customer,
        notes: [{ id: `${id}-pending`, at: now().toISOString(), text, byUserId: signedInUserId(client) ?? "" }, ...customer.notes],
      })),
    onError: (_error, _variables, snapshot) => rollBack(client, snapshot),
    onSettled: async (_data, _error, { id }) => {
      await client.invalidateQueries({ queryKey: queryKeys.customer(id) });
      await client.invalidateQueries({ queryKey: ["customers", "list"] });
    },
  });
}

/** Records a passport view (the fields, or the photo behind "הצגה"), then refreshes the access logs. */
export function useLogPassportView() {
  const { customers } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, part }: { id: string; part: PassportPart }) => customers.logPassportView(id, part),
    onSettled: async (_data, _error, { id }) => {
      await client.invalidateQueries({ queryKey: queryKeys.passportAccess(id) });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
}

// ---- Groups ----

export function useGroups() {
  const { groups } = useServices();
  return useQuery({ queryKey: queryKeys.groups, queryFn: () => groups.list() });
}

export function useGroup(id: string) {
  const { groups } = useServices();
  return useQuery({ queryKey: queryKeys.group(id), queryFn: () => groups.get(id) });
}

export function useGroupParticipants(id: string) {
  const { groups } = useServices();
  return useQuery({ queryKey: queryKeys.groupParticipants(id), queryFn: () => groups.participants(id) });
}

// ---- Overview ----

export function useOverview() {
  const { overview } = useServices();
  return useQuery({ queryKey: queryKeys.overview, queryFn: () => overview.stats() });
}

export function useActivity() {
  const { overview } = useServices();
  return useQuery({ queryKey: queryKeys.activity, queryFn: () => overview.activity() });
}

// ---- Holiday greetings ----

/** The next greeting that has not gone out (Hanukkah 5787 in the demo), or null. */
export function useCurrentCampaign() {
  const { greetings } = useServices();
  return useQuery({ queryKey: queryKeys.campaign, queryFn: () => greetings.current() });
}

/** Every greeting, newest first, the current one included. */
export function useCampaignHistory() {
  const { greetings } = useServices();
  return useQuery({ queryKey: queryKeys.campaignHistory, queryFn: () => greetings.history() });
}

/** The last greeting that finished sending (Sukkot 5787 in the demo), read from the history. */
export function useLastCampaign() {
  const { greetings } = useServices();
  return useQuery({
    queryKey: queryKeys.campaignHistory,
    queryFn: () => greetings.history(),
    select: (campaigns: HolidayCampaign[]) => campaigns.find((campaign) => campaign.status === "completed") ?? null,
  });
}

/** Audience chips with their recipient counts. */
export function useAudiences() {
  const { greetings } = useServices();
  return useQuery({ queryKey: queryKeys.audiences, queryFn: () => greetings.audiences() });
}

const greetingQueries = async (client: QueryClient) => {
  await client.invalidateQueries({ queryKey: ["greetings"] });
  await client.invalidateQueries({ queryKey: ["customers", "messages"] });
  await client.invalidateQueries({ queryKey: queryKeys.audit });
};

/** Saves the text or the audience. The current greeting changes on screen right away and rolls back if the call fails. */
export function useUpdateCampaign() {
  const { greetings } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CampaignPatch }) => greetings.update(id, patch),
    onMutate: ({ id, patch }) =>
      changeCached<HolidayCampaign | null>(client, queryKeys.campaign, (campaign) => {
        if (!campaign || campaign.id !== id) return campaign;
        const audience = patch.audienceId
          ? client.getQueryData<AudienceOption[]>(queryKeys.audiences)?.find((option) => option.id === patch.audienceId)
          : undefined;
        return {
          ...campaign,
          message: patch.message ?? campaign.message,
          ...(audience
            ? { audienceId: audience.id, recipients: audience.recipients, estimatedMinutes: estimateSendMinutes(audience.recipients, campaign.rate) }
            : {}),
        };
      }),
    onError: (_error, _variables, snapshot) => rollBack(client, snapshot),
    onSettled: () => greetingQueries(client),
  });
}

/** Approves the greeting for sending: it shows as scheduled right away and rolls back if the call fails. */
export function useApproveCampaign() {
  const { greetings } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => greetings.approve(id),
    onMutate: (id) =>
      changeCached<HolidayCampaign | null>(client, queryKeys.campaign, (campaign) =>
        campaign && campaign.id === id
          ? { ...campaign, status: "scheduled", stage: "track", approvedAt: now().toISOString(), approvedByUserId: signedInUserId(client) }
          : campaign,
      ),
    onError: (_error, _variables, snapshot) => rollBack(client, snapshot),
    onSettled: () => greetingQueries(client),
  });
}

/** Sends the greeting to the signed-in user's WhatsApp; `lastTest` records it. */
export function useSendCampaignTest() {
  const { greetings } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => greetings.sendTest(id),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["greetings"] });
    },
  });
}

// ---- Birthdays ----

export function useBirthdaySettings() {
  const { birthdays } = useServices();
  return useQuery({ queryKey: queryKeys.birthdaySettings, queryFn: () => birthdays.settings() });
}

/** Today, the coming week, recent sends and the count for the year. */
export function useBirthdays() {
  const { birthdays } = useServices();
  return useQuery({ queryKey: queryKeys.birthdays, queryFn: () => birthdays.overview() });
}

/** Changes birthday settings on screen right away (the automation switch, time, Shabbat rule, template), rolls back on failure. */
export function useUpdateBirthdaySettings() {
  const { birthdays } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: BirthdaySettingsPatch) => birthdays.updateSettings(patch),
    onMutate: (patch) => changeCached<BirthdaySettings>(client, queryKeys.birthdaySettings, (settings) => ({ ...settings, ...definedFields(patch) })),
    onError: (_error, _variables, snapshot) => rollBack(client, snapshot),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["birthdays"] });
    },
  });
}

// ---- Users and access ----

/** Staff accounts and pending invites. Also the place to look up a user's name by id. */
export function useUsers() {
  const { users } = useServices();
  return useQuery({ queryKey: queryKeys.users, queryFn: () => users.list() });
}

export function usePermissions() {
  const { users } = useServices();
  return useQuery({ queryKey: queryKeys.permissions, queryFn: () => users.permissions() });
}

export function useSecuritySettings() {
  const { users } = useServices();
  return useQuery({ queryKey: queryKeys.security, queryFn: () => users.security() });
}

/** Flips a security switch on screen right away and rolls back if the call fails. */
export function useUpdateSecuritySwitch() {
  const { users } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled }: { key: SecuritySwitch; enabled: boolean }) => users.updateSecurity(key, enabled),
    onMutate: ({ key, enabled }) => changeCached<SecuritySettings>(client, queryKeys.security, (settings) => ({ ...settings, [key]: enabled })),
    onError: (_error, _variables, snapshot) => rollBack(client, snapshot),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.security });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
}

/** Sensitive actions by staff, newest first. */
/** Saves the signed-in user's own name and email; the session and the team list pick them up. */
export function useUpdateProfile() {
  const { users } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => users.updateProfile(patch),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.session });
      await client.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useAuditLog() {
  const { users } = useServices();
  return useQuery({ queryKey: queryKeys.audit, queryFn: () => users.audit() });
}

// ---- Monday.com import ----

export function useImportRun() {
  const { imports } = useServices();
  return useQuery({ queryKey: queryKeys.importRun, queryFn: () => imports.latest() });
}

/** Approves the import and closes Monday.com: it shows as closed right away and rolls back if the call fails. */
export function useCloseMonday() {
  const { imports } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => imports.closeMonday(id),
    onMutate: (id) =>
      changeCached<ImportRun>(client, queryKeys.importRun, (run) =>
        run.id === id ? { ...run, monday: "closed", mondayClosedAt: now().toISOString(), mondayClosedByUserId: signedInUserId(client) } : run,
      ),
    onError: (_error, _variables, snapshot) => rollBack(client, snapshot),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["imports"] });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
}
