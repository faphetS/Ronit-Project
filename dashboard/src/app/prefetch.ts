import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../data/queries";
import { isoDay, now } from "../lib/clock";
import type { Services } from "../data/services";
import { useServices } from "../data/services-context";
import type { GroupSummary } from "../data/types";
import { filterFromParam, PAGE_SIZE } from "../screens/customers/customer-helpers";
import { selectGroup } from "../screens/groups/groups";
import { eventGroupsToRead } from "../screens/overview/calendar-model";
import type { RailKey } from "./sections";

/** How long after sign-in the other sections start loading, so the first screen settles in first. */
const WARM_DELAY_MS = 800;

interface Prefetch {
  queryKey: QueryKey;
  queryFn: () => Promise<unknown>;
}

/** The data each section shows when it opens, under the same keys as the screens' own queries. */
function sectionQueries({ overview, leads, customers, groups, greetings, birthdays, users, imports }: Services): Record<RailKey, Prefetch[]> {
  const stats = { queryKey: queryKeys.overview, queryFn: () => overview.stats() };
  const openLeads = { queryKey: queryKeys.leads({}), queryFn: () => leads.list({}) };
  // The leads page opens on today's board, and the overview's today card counts it: today's open leads, and the
  // not-relevant ones apart.
  const today = isoDay(now());
  const todaysLeads = { queryKey: queryKeys.leads({ day: today }), queryFn: () => leads.list({ day: today }) };
  const todaysClosed = {
    queryKey: queryKeys.leads({ day: today, status: "not-relevant" }),
    queryFn: () => leads.list({ day: today, status: "not-relevant" }),
  };
  const groupList = { queryKey: queryKeys.groups, queryFn: () => groups.list() };
  const intakes = { queryKey: queryKeys.intakes, queryFn: () => customers.intakes() };
  const campaign = { queryKey: queryKeys.campaign, queryFn: () => greetings.current() };
  const whatsapp = { queryKey: queryKeys.whatsapp, queryFn: () => greetings.whatsapp() };
  const birthdayOverview = { queryKey: queryKeys.birthdays, queryFn: () => birthdays.overview() };
  const importRun = { queryKey: queryKeys.importRun, queryFn: () => imports.latest() };
  const firstCustomers = { filter: filterFromParam(null), page: 1, pageSize: PAGE_SIZE };
  return {
    overview: [stats, { queryKey: queryKeys.activity, queryFn: () => overview.activity() }, openLeads, todaysLeads, todaysClosed, groupList, intakes],
    leads: [
      todaysLeads,
      todaysClosed,
      { queryKey: queryKeys.leadDays, queryFn: () => leads.days() },
      { queryKey: queryKeys.leadCounts, queryFn: () => leads.counts() },
      stats,
      importRun,
    ],
    customers: [
      { queryKey: queryKeys.customers(firstCustomers), queryFn: () => customers.list(firstCustomers) },
      { queryKey: queryKeys.customerCounts, queryFn: () => customers.counts() },
      groupList,
      intakes,
    ],
    groups: [groupList],
    holidays: [
      campaign,
      whatsapp,
      { queryKey: queryKeys.campaignHistory, queryFn: () => greetings.history() },
      { queryKey: queryKeys.audiences, queryFn: () => greetings.audiences() },
    ],
    birthdays: [birthdayOverview, { queryKey: queryKeys.birthdaySettings, queryFn: () => birthdays.settings() }, whatsapp],
    settings: [
      { queryKey: queryKeys.users, queryFn: () => users.list() },
      { queryKey: queryKeys.permissions, queryFn: () => users.permissions() },
      { queryKey: queryKeys.security, queryFn: () => users.security() },
      { queryKey: queryKeys.audit, queryFn: () => users.audit() },
      importRun,
    ],
  };
}

/**
 * Loads a section's data into the cache, so the section opens with its content instead of skeletons. Data that is
 * still fresh is left alone, and a failure is left for the screen to show.
 */
export async function prefetchSection(client: QueryClient, services: Services, key: RailKey): Promise<void> {
  await Promise.all(sectionQueries(services)[key].map((query) => client.prefetchQuery(query)));
  const groups = client.getQueryData<GroupSummary[]>(queryKeys.groups) ?? [];
  const participants = (id: string) => client.prefetchQuery({ queryKey: queryKeys.groupParticipants(id), queryFn: () => services.groups.participants(id) });
  if (key === "overview") {
    // The overview's calendar opens on this month, with the bookings of every challah month not over yet.
    const today = isoDay(now());
    await Promise.all(eventGroupsToRead(groups, today.slice(0, 7), today).map(participants));
    return;
  }
  if (key !== "groups") return;
  // The groups page opens on its first group's participants.
  const first = selectGroup(groups, undefined);
  if (first) await participants(first.id);
}

/** Loads a section's data as the pointer heads for it. */
export function usePrefetchSection(): (key: RailKey) => void {
  const client = useQueryClient();
  const services = useServices();
  return (key) => void prefetchSection(client, services, key);
}

/** Once signed in, loads every section's data in the background, so switching sections never waits. */
export function useWarmSections(): void {
  const client = useQueryClient();
  const services = useServices();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const key of Object.keys(sectionQueries(services)) as RailKey[]) void prefetchSection(client, services, key);
    }, WARM_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [client, services]);
}
