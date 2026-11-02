import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTestServices, renderApp, signedInServices } from "../test/app";
import { setViewportWidth } from "../test/viewport";
import { routes } from "./routes";

describe("routes", () => {
  it("sends visitors without a session to sign in, remembering where they were going", async () => {
    const { router } = renderApp(routes, { path: "/customers", services: createTestServices() });
    expect(await screen.findByRole("heading", { level: 1, name: /כניסה/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toEqual({ from: "/customers" });
  });

  it("opens the overview in the desktop shell after sign in", async () => {
    renderApp(routes, { services: await signedInServices() });
    expect(await screen.findByRole("heading", { name: "שלום, רונית בואי נראה מה קורה היום" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "כלים וניהול" })).toBeInTheDocument();
  });

  it("deep-links to a customer card", async () => {
    renderApp(routes, { path: "/customers/c-sara-cohen", services: await signedInServices() });
    expect(await screen.findByRole("heading", { name: "כרטיס לקוח" })).toBeInTheDocument();
  });

  it("redirects /greetings to the holiday greetings", async () => {
    const { router } = renderApp(routes, { path: "/greetings", services: await signedInServices() });
    expect(await screen.findByRole("heading", { name: /ברכות לחגים/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/greetings/holidays");
  });

  it("uses the tab bar on phones", async () => {
    setViewportWidth(390);
    renderApp(routes, { services: await signedInServices() });
    expect(await screen.findByRole("link", { name: "בית" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("complementary", { name: "כלים וניהול" })).not.toBeInTheDocument();
  });
});
