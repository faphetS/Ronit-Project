import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp, signedInServices } from "../../test/app";
import { DesktopShell } from "./DesktopShell";

const routes = [
  {
    path: "/",
    element: <DesktopShell />,
    children: [
      { index: true, element: <h1>overview page</h1> },
      { path: "leads", element: <h1>leads page</h1> },
      { path: "import", element: <h1>import page</h1> },
      { path: "login", element: <h1>login page</h1> },
    ],
  },
];

describe("DesktopShell", () => {
  it("marks the current section in the main menu", async () => {
    renderApp(routes, { path: "/leads", services: await signedInServices() });
    const menu = await screen.findByRole("navigation", { name: "ניווט ראשי" });
    expect(within(menu).getByRole("link", { name: /^לידים/ })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "סקירה" })).not.toHaveAttribute("aria-current");
  });

  it("shows this week's new leads in the menu and today's passports on the rail", async () => {
    renderApp(routes, { services: await signedInServices() });
    expect(await screen.findByRole("link", { name: "לידים 14" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "דרכונים מוואטסאפ, 3 חדשים" })).toHaveAttribute("href", "/customers?filter=whatsapp");
    expect(await screen.findByRole("button", { name: "התראות, 2 חדשות" })).toBeInTheDocument();
  });

  it("opens a tool from the rail and highlights it", async () => {
    const { router } = renderApp(routes, { services: await signedInServices() });
    await userEvent.click(await screen.findByRole("link", { name: "ייבוא מ-Monday" }));
    expect(await screen.findByRole("heading", { name: "import page" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/import");
    expect(screen.getByRole("link", { name: "ייבוא מ-Monday" })).toHaveAttribute("aria-current", "page");
  });

  it("signs out from the avatar", async () => {
    const { router } = renderApp(routes, { services: await signedInServices() });
    await userEvent.click(await screen.findByRole("button", { name: "רונית ברש, יציאה מהמערכת" }));
    expect(await screen.findByRole("heading", { name: "login page" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });
});
