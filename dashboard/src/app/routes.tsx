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
import { RequireAccess } from "./RequireAccess";
import { RequireSession } from "./RequireSession";
import { Shell } from "./Shell";

export const routes: RouteObject[] = [
  { path: "/login", element: <SignInScreen /> },
  {
    path: "/",
    element: (
      <RequireSession>
        <Shell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <OverviewScreen /> },
      // Sections the role table can close: a "no access" page then, in place of errors.
      { path: "leads", element: <RequireAccess area="leads"><LeadsScreen /></RequireAccess> },
      { path: "leads/:leadId", element: <RequireAccess area="leads"><LeadDetailScreen /></RequireAccess> },
      { path: "customers", element: <RequireAccess area="customers"><CustomersScreen /></RequireAccess> },
      { path: "customers/:customerId", element: <RequireAccess area="customers"><CustomerProfileScreen /></RequireAccess> },
      { path: "groups", element: <RequireAccess area="customers"><GroupsScreen /></RequireAccess> },
      { path: "groups/:groupId", element: <RequireAccess area="customers"><GroupsScreen /></RequireAccess> },
      { path: "greetings", element: <Navigate to="/greetings/holidays" replace /> },
      { path: "greetings/holidays", element: <RequireAccess area="greetings"><HolidaysScreen /></RequireAccess> },
      { path: "greetings/birthdays", element: <RequireAccess area="greetings"><BirthdaysScreen /></RequireAccess> },
      { path: "users", element: <UsersScreen /> },
      { path: "import", element: <ImportScreen /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
