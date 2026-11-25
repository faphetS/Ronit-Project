import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../data/queries";
import type { Services } from "../data/services";
import { IntakeInbox, IntakeList } from "../screens/customers/IntakeInbox";
import { SecurityCard } from "../screens/users/SecurityCard";
import { UsersDesktop } from "../screens/users/UsersDesktop";
import { createTestClient, renderApp, RoleKnown, signedInAs, signedInServices } from "../test/app";
import { prefetchSection } from "./prefetch";
import type { RailKey } from "./sections";

const RAIL: RailKey[] = ["overview", "leads", "customers", "groups", "holidays", "birthdays", "settings"];

/** The calls only some roles get (passports, greetings, birthdays, the access log), as spies over the test services. */
function spied(base: Services) {
  const spies = {
    intakes: vi.fn(base.customers.intakes),
    audit: vi.fn(base.users.audit),
    campaign: vi.fn(base.greetings.current),
    whatsapp: vi.fn(base.greetings.whatsapp),
    history: vi.fn(base.greetings.history),
    audiences: vi.fn(base.greetings.audiences),
    birthdays: vi.fn(base.birthdays.overview),
    birthdaySettings: vi.fn(base.birthdays.settings),
  };
  const services: Services = {
    ...base,
    customers: { ...base.customers, intakes: spies.intakes },
    users: { ...base.users, audit: spies.audit },
    greetings: { ...base.greetings, current: spies.campaign, whatsapp: spies.whatsapp, history: spies.history, audiences: spies.audiences },
    birthdays: { ...base.birthdays, overview: spies.birthdays, settings: spies.birthdaySettings },
  };
  return { services, spies };
}

// By the starting role table, sales views customers but has no passports, greetings or users.
describe("cards a role doesn't open", () => {
  it("locks the WhatsApp passports card for sales, and never asks for the passports", async () => {
    const { services, spies } = spied(await signedInAs("sales"));
    renderApp([{ path: "*", element: <><IntakeInbox /><RoleKnown /></> }], { services });
    await screen.findByText("role known");
    const card = screen.getByRole("region", { name: "דרכונים מוואטסאפ" });
    expect(within(card).getByText("נעול לתפקיד שלך")).toBeInTheDocument();
    expect(within(card).getByText("דרכונים פתוחים רק למשתמשים עם הרשאת דרכונים. אפשר לבקש מהניהול לפתוח.")).toBeInTheDocument();
    expect(within(card).queryByRole("alert")).not.toBeInTheDocument();
    expect(spies.intakes).not.toHaveBeenCalled();
  });

  it("locks the phone's list the same way", async () => {
    const { services, spies } = spied(await signedInAs("sales"));
    renderApp([{ path: "*", element: <><IntakeList /><RoleKnown /></> }], { services });
    await screen.findByText("role known");
    expect(within(screen.getByRole("region", { name: "דרכונים מוואטסאפ" })).getByText("נעול לתפקיד שלך")).toBeInTheDocument();
    expect(spies.intakes).not.toHaveBeenCalled();
  });

  it("still shows admins the passports", async () => {
    renderApp([{ path: "*", element: <IntakeInbox /> }], { services: await signedInServices() });
    expect(await screen.findByText("פנינה לוי")).toBeInTheDocument();
    expect(screen.queryByText("נעול לתפקיד שלך")).not.toBeInTheDocument();
  });

  it("locks the access log for anyone who doesn't manage users, and never asks for it", async () => {
    const { services, spies } = spied(await signedInAs("sales"));
    renderApp([{ path: "*", element: <><UsersDesktop /><RoleKnown /></> }], { services });
    await screen.findByText("role known");
    const card = screen.getByRole("region", { name: "פעולות רגישות אחרונות" });
    expect(within(card).getByText("רק משתמשים בתפקיד ניהול רואים את הפעולות האלה.")).toBeInTheDocument();
    expect(within(card).queryByRole("alert")).not.toBeInTheDocument();
    expect(spies.audit).not.toHaveBeenCalled();
  });

  it("shows sales the security settings with locked switches", async () => {
    const base = await signedInAs("sales");
    const updateSecurity = vi.fn(base.users.updateSecurity);
    const services: Services = { ...base, users: { ...base.users, updateSecurity } };
    renderApp([{ path: "*", element: <><SecurityCard phone={false} /><RoleKnown /></> }], { services });
    await screen.findByText("role known");
    const card = screen.getByRole("region", { name: "אבטחה" });
    const switches = await within(card).findAllByRole("switch");
    for (const control of switches) expect(control).toBeDisabled();
    expect(within(card).getByText("רק משתמשים בתפקיד ניהול משנים את ההגדרות האלה.")).toBeInTheDocument();
    await userEvent.click(switches[0]);
    expect(updateSecurity).not.toHaveBeenCalled();
  });

  it("warms only the data the person's role opens", async () => {
    const warm = async (services: Services) => {
      const client = createTestClient();
      client.setQueryData(queryKeys.session, await services.session.current());
      for (const key of RAIL) await prefetchSection(client, services, key);
      return client;
    };
    const sales = spied(await signedInAs("sales"));
    const cache = await warm(sales.services);
    for (const spy of Object.values(sales.spies)) expect(spy).not.toHaveBeenCalled();
    // What sales may open still opens with its data in place.
    expect(cache.getQueryData(queryKeys.customerCounts)).toBeDefined();
    expect(cache.getQueryData(queryKeys.users)).toBeDefined();

    const admin = spied(await signedInServices());
    await warm(admin.services);
    for (const spy of Object.values(admin.spies)) expect(spy).toHaveBeenCalled();
  });
});
