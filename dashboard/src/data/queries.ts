import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { now } from "../lib/clock";
import { accessFor, atLeast, estimateSendMinutes } from "./rules";
import type {
  AccessInput,
  BirthdaySettingsPatch,
  CampaignPatch,
  CustomerQuery,
  GroupInput,
  InviteInput,
  LeadFilters,
  PassportPart,
  PermissionChange,
  ProfilePatch,
  SignedIn,
  SignInChange,
} from "./services";
import { useServices } from "./services-context";
import type {
  AudienceOption,
  BirthdaySettings,
  Customer,
  HolidayCampaign,
  Lead,
  LeadStatus,
  MondayCopy,
  PermissionArea,
  PermissionMatrix,
  SecuritySettings,
  SecuritySwitch,
  SettableLeadStatus,
  StaffAccess,
} from "./types";

export const queryKeys = {
  session: ["session"] as const,
  pendingCode: ["sign-in", "code"] as const,
  leads: (filters: LeadFilters) => ["leads", "list", filters] as const,
  leadCounts: ["leads", "counts"] as const,
  leadDays: ["leads", "days"] as const,
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
  whatsapp: ["greetings", "whatsapp"] as const,
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

/** "Continue with Google" by redirect: the screen follows `redirectTo` (test services may go straight to the code). */
export function useStartGoogle() {
  const { session } = useServices();
  return useMutation({ mutationFn: (options: { remember: boolean; returnTo: string }) => session.startGoogle(options) });
}

/** The answer from Google's own button. Signing in on a remembered device puts the session straight into the cache. */
export function useGoogleCredential() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ credential, remember, returnTo }: { credential: string; remember: boolean; returnTo: string }) =>
      session.googleCredential(credential, { remember, returnTo }),
    onSuccess: (result) => {
      if (result.step === "signed-in") client.setQueryData(queryKeys.session, result.signedIn);
    },
  });
}

/** The username (or email) and password. Signing in on a remembered device puts the session straight into the cache. */
export function usePasswordSignIn() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ login, password, remember, returnTo }: { login: string; password: string; remember: boolean; returnTo: string }) =>
      session.password(login, password, { remember, returnTo }),
    onSuccess: (result) => {
      if (result.step === "signed-in") client.setQueryData(queryKeys.session, result.signedIn);
    },
  });
}

/** The code waiting after Google or a password, read fresh each time the code step opens. */
export function usePendingCode(enabled: boolean) {
  const { session } = useServices();
  return useQuery({ queryKey: queryKeys.pendingCode, queryFn: () => session.pendingCode(), enabled, retry: false, staleTime: 0, gcTime: 0 });
}

export function useResendCode() {
  const { session } = useServices();
  return useMutation({ mutationFn: () => session.resendCode() });
}

/** The 6-digit code from the email. Signing in puts the session straight into the cache. */
export function useVerifyCode() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => session.verifyCode(code),
    onSuccess: ({ signedIn }) => client.setQueryData(queryKeys.session, signedIn),
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

export function useLeadDays() {
  const { leads } = useServices();
  return useQuery({ queryKey: queryKeys.leadDays, queryFn: () => leads.days() });
}

export function useLead(id: string) {
  const { leads } = useServices();
  return useQuery({ queryKey: queryKeys.lead(id), queryFn: () => leads.get(id) });
}

/** Refreshes a lead's card and every leads list after one of its notes changed. */
async function refreshLead(client: QueryClient, id: string) {
  await client.invalidateQueries({ queryKey: queryKeys.lead(id) });
  await client.invalidateQueries({ queryKey: ["leads", "list"] });
}

/** Adds a CRM note to a lead. It shows once the save resolves. */
export function useAddLeadNote() {
  const { leads } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => leads.addNote(id, text),
    onSettled: (_data, _error, { id }) => refreshLead(client, id),
  });
}

export function useEditLeadNote() {
  const { leads } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, noteId, text }: { id: string; noteId: string; text: string }) => leads.editNote(id, noteId, text),
    onSettled: (_data, _error, { id }) => refreshLead(client, id),
  });
}

export function useDeleteLeadNote() {
  const { leads } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, noteId }: { id: string; noteId: string }) => leads.deleteNote(id, noteId),
    onSettled: (_data, _error, { id }) => refreshLead(client, id),
  });
}

const setStatusKey = ["leads", "set-status"] as const;

/** A lead's status as the cache has it: its own card first, else the first cached list that holds it. */
function cachedStatus(client: QueryClient, id: string): LeadStatus | undefined {
  const detail = client.getQueryData<Lead>(queryKeys.lead(id));
  if (detail) return detail.status;
  for (const [, list] of client.getQueriesData<Lead[]>({ queryKey: ["leads", "list"] })) {
    const found = list?.find((lead) => lead.id === id);
    if (found) return found.status;
  }
  return undefined;
}

/** Sets a lead's status in every cached list and in its own card. With `only`, just where it still has that status. */
function setCachedStatus(client: QueryClient, id: string, status: LeadStatus, only?: LeadStatus) {
  const applies = (lead: Lead) => lead.status !== status && (only === undefined || lead.status === only);
  client.setQueriesData<Lead[]>({ queryKey: ["leads", "list"] }, (list) =>
    list?.some((lead) => lead.id === id && applies(lead)) ? list.map((lead) => (lead.id === id ? { ...lead, status } : lead)) : list,
  );
  client.setQueryData<Lead>(queryKeys.lead(id), (lead) => (lead && applies(lead) ? { ...lead, status } : lead));
}

/**
 * Gives a lead a new status. It changes at once in every cached list and in the lead's own card, so the board moves the
 * card while the call is out. A failed call puts the lead back, unless a later move has moved it since. The leads and the
 * overview refresh once the last of several quick moves has settled.
 */
export function useSetLeadStatus() {
  const { leads } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationKey: setStatusKey,
    mutationFn: ({ id, status }: { id: string; status: SettableLeadStatus }) => leads.setStatus(id, status),
    onMutate: async ({ id, status }): Promise<{ previous: LeadStatus | undefined }> => {
      await client.cancelQueries({ queryKey: ["leads"] });
      const previous = cachedStatus(client, id);
      setCachedStatus(client, id, status);
      return { previous };
    },
    onError: (_error, { id, status }, context) => {
      if (context?.previous) setCachedStatus(client, id, context.previous, status);
    },
    onSuccess: (lead) => {
      if (client.isMutating({ mutationKey: setStatusKey }) === 1) client.setQueryData(queryKeys.lead(lead.id), lead);
    },
    onSettled: async () => {
      if (client.isMutating({ mutationKey: setStatusKey }) > 1) return;
      await client.invalidateQueries({ queryKey: ["leads"] });
      await client.invalidateQueries({ queryKey: ["overview"] });
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

/** Records a passport view (the fields, or the photo behind "הצגה") and returns the full number, then refreshes the access logs. */
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

/** The participants of several groups at once, each under its group's own key, so the groups page reuses them. */
export function useParticipantsOf(ids: readonly string[]) {
  const { groups } = useServices();
  return useQueries({
    queries: ids.map((id) => ({ queryKey: queryKeys.groupParticipants(id), queryFn: () => groups.participants(id) })),
  });
}

/** Groups, the leads that show them, and the overview and customer numbers a group change moves. */
async function refreshGroups(client: QueryClient) {
  await Promise.all(["groups", "leads", "overview", "customers"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

export function useCreateGroup() {
  const { groups } = useServices();
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: GroupInput) => groups.create(input), onSettled: () => refreshGroups(client) });
}

export function useUpdateGroup() {
  const { groups } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<GroupInput> }) => groups.update(id, patch),
    onSettled: () => refreshGroups(client),
  });
}

export function useRemoveGroup() {
  const { groups } = useServices();
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => groups.remove(id), onSettled: () => refreshGroups(client) });
}

/** Registers a lead in a group: her status, her card and the group's participants all change. */
export function useAddLeadToGroup() {
  const { groups } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, leadId }: { id: string; leadId: string }) => groups.addLead(id, leadId),
    onSettled: () => refreshGroups(client),
  });
}

export function useRemoveGroupMember() {
  const { groups } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memberId }: { id: string; memberId: string }) => groups.removeMember(id, memberId),
    onSettled: () => refreshGroups(client),
  });
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

/** While WhatsApp reviews the text, ask again every minute: Meta usually answers within minutes. */
const REVIEW_POLL_MS = 60_000;

/** The next greeting that has not gone out, or null. Followed every minute while WhatsApp reviews it. */
export function useCurrentCampaign() {
  const { greetings } = useServices();
  return useQuery({
    queryKey: queryKeys.campaign,
    queryFn: () => greetings.current(),
    refetchInterval: (query) => (query.state.data?.status === "in-review" ? REVIEW_POLL_MS : false),
  });
}

/** Whether WhatsApp is connected, and whether greetings go out. */
export function useWhatsAppStatus() {
  const { greetings } = useServices();
  return useQuery({ queryKey: queryKeys.whatsapp, queryFn: () => greetings.whatsapp() });
}

/** Starts the next holiday's greeting; the screen opens on it. */
export function useCreateCampaign() {
  const { greetings } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => greetings.create(),
    onSuccess: (campaign) => client.setQueryData(queryKeys.campaign, campaign),
    onSettled: () => greetingQueries(client),
  });
}

/** Sends the text to WhatsApp for review. */
export function useSubmitCampaign() {
  const { greetings } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => greetings.submit(id),
    onSuccess: (campaign) => client.setQueryData(queryKeys.campaign, campaign),
    onSettled: () => greetingQueries(client),
  });
}

/** Every greeting, newest first, the current one included. */
export function useCampaignHistory() {
  const { greetings } = useServices();
  return useQuery({ queryKey: queryKeys.campaignHistory, queryFn: () => greetings.history() });
}

/** The last greeting that finished sending, read from the history. */
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

/** The birthday settings. Followed every minute while WhatsApp reviews a new text. */
export function useBirthdaySettings() {
  const { birthdays } = useServices();
  return useQuery({
    queryKey: queryKeys.birthdaySettings,
    queryFn: () => birthdays.settings(),
    refetchInterval: (query) => (query.state.data?.templateReview?.status === "PENDING" ? REVIEW_POLL_MS : false),
  });
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

/**
 * What the signed-in person may do in each area, from the role table the server enforces. Null until both the
 * session and the table are in; screens then show their content and the server still decides.
 */
export function useAccess(): StaffAccess | null {
  const session = useSession();
  const permissions = usePermissions();
  const user = session.data?.user;
  return user && permissions.data ? accessFor(permissions.data, user) : null;
}

/** Whether an area's content shows. True until the role table says otherwise, so nothing flickers away while it loads. */
export function useMaySee(area: PermissionArea): boolean {
  const access = useAccess();
  return !access || atLeast(access[area] ?? "none", "view");
}

/** Whether the signed-in person may do this. False until it's known: for the actions only some people get. */
export function useCan(area: PermissionArea, level: "view" | "full"): boolean {
  const access = useAccess();
  return access ? atLeast(access[area] ?? "none", level) : false;
}

/** Changes one cell of the role table; the table and the log pick it up. */
export function useChangePermission() {
  const { users } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: PermissionChange) => users.changePermission(change),
    onSuccess: (matrix) => client.setQueryData<PermissionMatrix>(queryKeys.permissions, matrix),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.permissions });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
}

/** Changes someone's role and passport access; the team list, the log and (for yourself) the session pick it up. */
export function useChangeAccess() {
  const { users } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: AccessInput }) => users.changeAccess(userId, input),
    onSuccess: (directory) => client.setQueryData(queryKeys.users, directory),
    onSettled: async (_data, _error, { userId }) => {
      await client.invalidateQueries({ queryKey: queryKeys.users });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
      if (userId === signedInUserId(client)) await client.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

/** An admin changes someone's username or sets a new password; the team list and the log pick it up. */
export function useChangeSignIn() {
  const { users } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, change }: { userId: string; change: SignInChange }) => users.changeSignIn(userId, change),
    onSuccess: (directory) => client.setQueryData(queryKeys.users, directory),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.users });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
}

/** Your own password; the team list (which says whether you have one) and the log pick it up. */
export function useChangeOwnPassword() {
  const { users } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { current: string; next: string }) => users.changeOwnPassword(input),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.users });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
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

/** Saves the signed-in user's own name; the session and the team list pick it up. */
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

/** Sensitive actions, newest first. */
export function useAuditLog() {
  const { users } = useServices();
  return useQuery({ queryKey: queryKeys.audit, queryFn: () => users.audit() });
}

/** Gives someone an account and emails the invite; the team list and the log pick it up. */
export function useInviteUser() {
  const { users } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteInput) => users.invite(input),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.users });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
}

/** Closes someone's account and signs them out everywhere. */
export function useRemoveUser() {
  const { users } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => users.remove(userId),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.users });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
}

// ---- The copy from Monday ----

/** While a copy runs, ask again every few seconds. */
const COPY_POLL_MS = 3000;

/** How the copy from Monday stands. Asks again every few seconds while a copy is running. */
export function useImportRun() {
  const { imports } = useServices();
  return useQuery({
    queryKey: queryKeys.importRun,
    queryFn: () => imports.latest(),
    refetchInterval: (query) => (query.state.data?.lastRun?.status === "running" ? COPY_POLL_MS : false),
  });
}

/** Copies from Monday now. The page shows the run right away and follows it; when it's done, every list refreshes. */
export function useCopyNow() {
  const { imports } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => imports.copyNow(),
    onSuccess: (run) => {
      client.setQueryData<MondayCopy>(queryKeys.importRun, (copy) => (copy ? { ...copy, lastRun: run } : copy));
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.importRun });
      await client.invalidateQueries({ queryKey: queryKeys.audit });
    },
  });
}
