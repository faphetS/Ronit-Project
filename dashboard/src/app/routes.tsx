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
      { path: "leads", element: <LeadsScreen /> },
      { path: "leads/:leadId", element: <LeadDetailScreen /> },
      { path: "customers", element: <CustomersScreen /> },
      { path: "customers/:customerId", element: <CustomerProfileScreen /> },
      { path: "groups", element: <GroupsScreen /> },
      { path: "groups/:groupId", element: <GroupsScreen /> },
      { path: "greetings", element: <Navigate to="/greetings/holidays" replace /> },
      { path: "greetings/holidays", element: <HolidaysScreen /> },
      { path: "greetings/birthdays", element: <BirthdaysScreen /> },
      { path: "users", element: <UsersScreen /> },
      { path: "import", element: <ImportScreen /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
