import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../data/queries";
import { accessFor, atLeast } from "../data/rules";
import { isoDay, now } from "../lib/clock";
import type { Services, SignedIn } from "../data/services";
import { useServices } from "../data/services-context";
import type { GroupSummary, PermissionArea, StaffAccess } from "../data/types";
import { filterFromParam, PAGE_SIZE } from "../screens/customers/customer-helpers";
import { selectGroup } from "../screens/groups/groups";
import { eventGroupsToRead } from "../screens/overview/calendar-model";
import type { RailKey } from "./sections";

/** How long after sign-in the other sections start loading, so the first screen settles in first. */
const WARM_DELAY_MS = 800;

/** The level the API asks for a piece of data (its requireAccess), so a role is never sent for what it can't open. */
type Need = readonly [PermissionArea, "view" | "full"];
const LEADS: Need = ["leads", "view"];
const CUSTOMERS: Need = ["customers", "view"];
const PASSPORTS: Need = ["passports", "view"];
const GREETINGS: Need = ["greetings", "view"];
const ADMINS: Need = ["users", "full"];

interface Prefetch {
  queryKey: QueryKey;
  queryFn: () => Promise<unknown>;
  /** Left out for data every signed-in person gets. */
  needs?: Need;
}

/** The data each section shows when it opens, under the same keys as the screens' own queries. */
function sectionQueries({ overview, leads, customers, groups, greetings, birthdays, users, imports }: Services): Record<RailKey, Prefetch[]> {
  const stats = { queryKey: queryKeys.overview, queryFn: () => overview.stats() };
  const openLeads = { queryKey: queryKeys.leads({}), queryFn: () => leads.list({}), needs: LEADS };
  // The leads page opens on today's board, and the overview's today card counts it: today's open leads, and the
  // not-relevant ones apart.
  const today = isoDay(now());
  const todaysLeads = { queryKey: queryKeys.leads({ day: today }), queryFn: () => leads.list({ day: today }), needs: LEADS };
  const todaysClosed = {
    queryKey: queryKeys.leads({ day: today, status: "not-relevant" }),
    queryFn: () => leads.list({ day: today, status: "not-relevant" }),
    needs: LEADS,
  };
  const groupList = { queryKey: queryKeys.groups, queryFn: () => groups.list(), needs: CUSTOMERS };
  const intakes = { queryKey: queryKeys.intakes, queryFn: () => customers.intakes(), needs: PASSPORTS };
  const campaign = { queryKey: queryKeys.campaign, queryFn: () => greetings.current(), needs: GREETINGS };
  const whatsapp = { queryKey: queryKeys.whatsapp, queryFn: () => greetings.whatsapp(), needs: GREETINGS };
  const birthdayOverview = { queryKey: queryKeys.birthdays, queryFn: () => birthdays.overview(), needs: GREETINGS };
  const importRun = { queryKey: queryKeys.importRun, queryFn: () => imports.latest() };
  const firstCustomers = { filter: filterFromParam(null), page: 1, pageSize: PAGE_SIZE };
  return {
    overview: [stats, { queryKey: queryKeys.activity, queryFn: () => overview.activity() }, openLeads, todaysLeads, todaysClosed, groupList, intakes],
    leads: [
      todaysLeads,
      todaysClosed,
      { queryKey: queryKeys.leadDays, queryFn: () => leads.days(), needs: LEADS },
      { queryKey: queryKeys.leadCounts, queryFn: () => leads.counts(), needs: LEADS },
      stats,
      importRun,
    ],
    customers: [
      { queryKey: queryKeys.customers(firstCustomers), queryFn: () => customers.list(firstCustomers), needs: CUSTOMERS },
      { queryKey: queryKeys.customerCounts, queryFn: () => customers.counts(), needs: CUSTOMERS },
      groupList,
      intakes,
    ],
    groups: [groupList],
    holidays: [
      campaign,
      whatsapp,
      { queryKey: queryKeys.campaignHistory, queryFn: () => greetings.history(), needs: GREETINGS },
      { queryKey: queryKeys.audiences, queryFn: () => greetings.audiences(), needs: GREETINGS },
    ],
    birthdays: [birthdayOverview, { queryKey: queryKeys.birthdaySettings, queryFn: () => birthdays.settings(), needs: GREETINGS }, whatsapp],
    settings: [
      { queryKey: queryKeys.users, queryFn: () => users.list() },
      { queryKey: queryKeys.permissions, queryFn: () => users.permissions() },
      { queryKey: queryKeys.security, queryFn: () => users.security() },
      { queryKey: queryKeys.audit, queryFn: () => users.audit(), needs: ADMINS },
      importRun,
    ],
  };
}

/**
 * The signed-in person's level in each area: the session and the role table from the cache, asking for the table if
 * it isn't in yet. Null when either can't be had; then only the data every signed-in person gets is loaded.
 */
async function accessNow(client: QueryClient, services: Services): Promise<StaffAccess | null> {
  const signedIn = client.getQueryData<SignedIn | null>(queryKeys.session);
  if (!signedIn) return null;
  try {
    const matrix = await client.ensureQueryData({ queryKey: queryKeys.permissions, queryFn: () => services.users.permissions() });
    return accessFor(matrix, signedIn.user);
  } catch {
    return null;
  }
}

/**
 * Loads a section's data into the cache, so the section opens with its content instead of skeletons. Data that is
 * still fresh is left alone, and a failure is left for the screen to show. Data the person's role doesn't open is
 * never asked for: the API would refuse it, and the screen shows a lock or a "no access" page there.
 */
export async function prefetchSection(client: QueryClient, services: Services, key: RailKey): Promise<void> {
  const access = await accessNow(client, services);
  const allowed = (needs: Need | undefined) => !needs || (access !== null && atLeast(access[needs[0]] ?? "none", needs[1]));
  const queries = sectionQueries(services)[key].filter((query) => allowed(query.needs));
  await Promise.all(queries.map(({ queryKey, queryFn }) => client.prefetchQuery({ queryKey, queryFn })));
  if (!allowed(CUSTOMERS)) return;
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
