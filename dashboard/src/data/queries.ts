import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerQuery, LeadFilters } from "./services";
import { useServices } from "./services-context";
import type { Lead, LeadStatus } from "./types";

export const queryKeys = {
  session: ["session"] as const,
  leads: (filters: LeadFilters) => ["leads", "list", filters] as const,
  leadCounts: ["leads", "counts"] as const,
  lead: (id: string) => ["leads", "detail", id] as const,
  customers: (query: CustomerQuery) => ["customers", "list", query] as const,
  customer: (id: string) => ["customers", "detail", id] as const,
  intakes: ["customers", "intakes"] as const,
  groups: ["groups"] as const,
  overview: ["overview", "stats"] as const,
  activity: ["overview", "activity"] as const,
};

export function useSession() {
  const { session } = useServices();
  return useQuery({ queryKey: queryKeys.session, queryFn: () => session.current() });
}

export function useSignIn() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => session.signIn(email, password),
    onSuccess: (signedIn) => client.setQueryData(queryKeys.session, signedIn),
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

export function useCustomers(query: CustomerQuery = {}) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customers(query), queryFn: () => customers.list(query), placeholderData: keepPreviousData });
}

export function useCustomer(id: string) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customer(id), queryFn: () => customers.get(id) });
}

export function usePassportIntakes() {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.intakes, queryFn: () => customers.intakes() });
}

export function useGroups() {
  const { groups } = useServices();
  return useQuery({ queryKey: queryKeys.groups, queryFn: () => groups.list() });
}

export function useOverview() {
  const { overview } = useServices();
  return useQuery({ queryKey: queryKeys.overview, queryFn: () => overview.stats() });
}

export function useActivity() {
  const { overview } = useServices();
  return useQuery({ queryKey: queryKeys.activity, queryFn: () => overview.activity() });
}
