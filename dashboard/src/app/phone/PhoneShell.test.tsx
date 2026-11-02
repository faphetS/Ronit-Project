import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderApp, signedInServices } from "../../test/app";
import { setViewportWidth } from "../../test/viewport";
import { PhoneShell } from "./PhoneShell";
import { PhoneTopBar } from "./PhoneTopBar";

const routes = [
  {
    path: "/",
    element: <PhoneShell />,
    children: [
      { index: true, element: (<><PhoneTopBar /><h1>home screen</h1></>) },
      { path: "customers", element: (<><PhoneTopBar /><h1>customers screen</h1></>) },
      { path: "customers/:id", element: (<><PhoneTopBar title="customer card" /><h1>profile screen</h1></>) },
      { path: "users", element: <h1>account screen</h1> },
    ],
  },
];

describe("PhoneShell", () => {
  beforeEach(() => setViewportWidth(390));

  it("switches tabs and marks the current one", async () => {
    renderApp(routes, { services: await signedInServices() });
    const tabs = await screen.findByRole("navigation", { name: "ניווט ראשי" });
    expect(within(tabs).getByRole("link", { name: "בית" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(tabs).getByRole("link", { name: "לקוחות" }));
    expect(await screen.findByRole("heading", { name: "customers screen" })).toBeInTheDocument();
    expect(within(tabs).getByRole("link", { name: "לקוחות" })).toHaveAttribute("aria-current", "page");
  });

  it("pushes a detail screen and goes back to the list", async () => {
    const { router } = renderApp(routes, { path: "/customers", services: await signedInServices() });
    await screen.findByRole("heading", { name: "customers screen" });
    await act(() => router.navigate("/customers/c-sara-cohen"));
    expect(await screen.findByRole("heading", { name: "profile screen" })).toBeInTheDocument();
    expect(screen.getByText("customer card")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "חזרה" }));
    expect(await screen.findByRole("heading", { name: "customers screen" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/customers");
  });

  it("goes back to the parent when a pushed screen was opened directly", async () => {
    const { router } = renderApp(routes, { path: "/customers/c-sara-cohen", services: await signedInServices() });
    await userEvent.click(await screen.findByRole("button", { name: "חזרה" }));
    expect(await screen.findByRole("heading", { name: "customers screen" })).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ direction: "back" });
  });

  it("opens the account screen from the avatar", async () => {
    renderApp(routes, { services: await signedInServices() });
    await userEvent.click(await screen.findByRole("link", { name: "רונית ברש, חשבון וניהול" }));
    expect(await screen.findByRole("heading", { name: "account screen" })).toBeInTheDocument();
  });
});
