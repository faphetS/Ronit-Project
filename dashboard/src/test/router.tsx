import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";

/** Renders routes in a memory router. Navigate with the returned `router`. */
export function renderRoutes(routes: RouteObject[], initialPath = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

/** Renders one element at every path, for components that need a router (links). */
export function renderInRouter(ui: ReactElement, initialPath = "/") {
  return renderRoutes([{ path: "*", element: ui }], initialPath);
}
