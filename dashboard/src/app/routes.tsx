import { Navigate, type RouteObject } from "react-router";
import { Placeholder } from "../screens/Placeholder";
import { SignInScreen } from "../screens/sign-in/SignInScreen";
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
      { index: true, element: <Placeholder screen="overview" /> },
      { path: "leads", element: <Placeholder screen="leads" /> },
      { path: "leads/:leadId", element: <Placeholder screen="lead" /> },
      { path: "customers", element: <Placeholder screen="customers" /> },
      { path: "customers/:customerId", element: <Placeholder screen="customer" /> },
      { path: "groups", element: <Placeholder screen="groups" /> },
      { path: "groups/:groupId", element: <Placeholder screen="groups" /> },
      { path: "greetings", element: <Navigate to="/greetings/holidays" replace /> },
      { path: "greetings/holidays", element: <Placeholder screen="holidays" /> },
      { path: "greetings/birthdays", element: <Placeholder screen="birthdays" /> },
      { path: "users", element: <Placeholder screen="users" /> },
      { path: "import", element: <Placeholder screen="import" /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
