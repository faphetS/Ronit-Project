import { Navigate, type RouteObject } from "react-router";
import { CustomerProfileScreen } from "../screens/customers/CustomerProfileScreen";
import { CustomersScreen } from "../screens/customers/CustomersScreen";
import { BirthdaysScreen } from "../screens/greetings/BirthdaysScreen";
import { HolidaysScreen } from "../screens/greetings/HolidaysScreen";
import { GroupsScreen } from "../screens/groups/GroupsScreen";
import { ImportScreen } from "../screens/import/ImportScreen";
import { LeadDetailScreen } from "../screens/leads/LeadDetailScreen";
import { LeadsScreen } from "../screens/leads/LeadsScreen";
import { OverviewScreen } from "../screens/overview/OverviewScreen";
import { SignInScreen } from "../screens/sign-in/SignInScreen";
import { UsersScreen } from "../screens/users/UsersScreen";
import type { ReelSection } from "../motion/SectionReel";
import { RequireAccess } from "./RequireAccess";
import { RequireSession } from "./RequireSession";
import { Shell } from "./Shell";

// Each rail section's main page. Sections the role table can close show a "no access" page then, in place of errors.
const overview = <OverviewScreen />;
const leads = <RequireAccess area="leads"><LeadsScreen /></RequireAccess>;
const customers = <RequireAccess area="customers"><CustomersScreen /></RequireAccess>;
const groups = <RequireAccess area="customers"><GroupsScreen /></RequireAccess>;
const holidays = <RequireAccess area="greetings"><HolidaysScreen /></RequireAccess>;
const birthdays = <RequireAccess area="greetings"><BirthdaysScreen /></RequireAccess>;
const users = <UsersScreen />;

/** The sections' main pages in the rail's order (app/sections.ts): what the desktop reel shows as it spins past. */
export const SECTION_PAGES: readonly ReelSection[] = [
  { path: "/", element: overview },
  { path: "/leads", element: leads },
  { path: "/customers", element: customers },
  { path: "/groups", element: groups },
  { path: "/greetings/holidays", element: holidays },
  { path: "/greetings/birthdays", element: birthdays },
  { path: "/users", element: users },
];

export const routes: RouteObject[] = [
  { path: "/login", element: <SignInScreen /> },
  {
    path: "/",
    element: (
      <RequireSession>
        <Shell sections={SECTION_PAGES} />
      </RequireSession>
    ),
    children: [
      { index: true, element: overview },
      { path: "leads", element: leads },
      { path: "leads/:leadId", element: <RequireAccess area="leads"><LeadDetailScreen /></RequireAccess> },
      { path: "customers", element: customers },
      { path: "customers/:customerId", element: <RequireAccess area="customers"><CustomerProfileScreen /></RequireAccess> },
      { path: "groups", element: groups },
      { path: "groups/:groupId", element: groups },
      { path: "greetings", element: <Navigate to="/greetings/holidays" replace /> },
      { path: "greetings/holidays", element: holidays },
      { path: "greetings/birthdays", element: birthdays },
      { path: "users", element: users },
      { path: "import", element: <ImportScreen /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
