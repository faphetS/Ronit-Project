import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CustomerQuery, LeadFilters, Services } from "../../data/services";
import type { GroupSummary } from "../../data/types";
import { renderApp, signedInServices } from "../../test/app";
import { testLead } from "../../test/leads";
import { QuickSearch } from "./QuickSearch";

/** Made-up leads, one customer and one trip, answered the way the API searches: name, or digits in the phone. */
async function servicesWithResults() {
  const base = await signedInServices();
  const leads = [testLead({ id: "lead-1", name: "יעל דהן", phone: "0541111111", status: "new" }), testLead({ id: "lead-2", name: "מאיה לוי", phone: "0542222222" })];
  const yael = { ...(await base.customers.get("c-1")), id: "c-1", firstName: "יעל", lastName: "כהן", phone: "0543333333" };
  const trip = { id: "g-1", name: "אומן · חנוכה", shortName: null } as unknown as GroupSummary;
  const matches = (name: string, phone: string, term = "") => name.includes(term) || (/\d/.test(term) && phone.includes(term));
  const leadList = vi.fn(async (filters: LeadFilters = {}) => leads.filter((lead) => matches(lead.name, lead.phone, filters.search)));
  const customerList = vi.fn(async (query: CustomerQuery = {}) => {
    const items = [yael].filter((customer) => matches(`${customer.firstName} ${customer.lastName}`, customer.phone, query.search));
    return { items, total: items.length, page: 1, pageSize: query.pageSize ?? 25 };
  });
  const services: Services = {
    ...base,
    leads: { ...base.leads, list: leadList },
    customers: { ...base.customers, list: customerList },
    groups: { ...base.groups, list: async () => [trip] },
  };
  return { services, leadList };
}

describe("QuickSearch", () => {
  it("finds leads and customers by name, and opens the one picked with the keyboard", async () => {
    const { services } = await servicesWithResults();
    const { router } = renderApp([{ path: "*", element: <QuickSearch /> }], { services });
    const field = screen.getByRole("combobox", { name: "חיפוש מהיר" });
    await userEvent.type(field, "יעל");
    const list = await screen.findByRole("listbox", { name: "חיפוש מהיר" });
    expect(await within(list).findByRole("option", { name: /יעל דהן/ })).toBeInTheDocument();
    expect(within(list).getByRole("group", { name: /לידים/ })).toBeInTheDocument();
    expect(await within(list).findByRole("option", { name: /יעל כהן/ })).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-activedescendant", within(list).getByRole("option", { name: /יעל דהן/ }).id);
    await userEvent.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute("aria-activedescendant", within(list).getByRole("option", { name: /יעל כהן/ }).id);
    await userEvent.keyboard("{Enter}");
    expect(router.state.location.pathname).toBe("/customers/c-1");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(field).toHaveValue("");
  });

  it("finds a lead by phone digits and opens it with a click, and finds groups by name", async () => {
    const { services } = await servicesWithResults();
    const { router } = renderApp([{ path: "*", element: <QuickSearch /> }], { services });
    const field = screen.getByRole("combobox", { name: "חיפוש מהיר" });
    await userEvent.type(field, "2222");
    await userEvent.click(await screen.findByRole("option", { name: /מאיה לוי/ }));
    expect(router.state.location.pathname).toBe("/leads/lead-2");
    await userEvent.type(field, "חנוכה");
    expect(await screen.findByRole("option", { name: /אומן · חנוכה/ })).toBeInTheDocument();
  });

  it("waits for two characters, says when nothing matches, and closes on Escape", async () => {
    const { services, leadList } = await servicesWithResults();
    renderApp([{ path: "*", element: <QuickSearch /> }], { services });
    const field = screen.getByRole("combobox", { name: "חיפוש מהיר" });
    await userEvent.type(field, "ז");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.type(field, "ז");
    expect(await screen.findByText("לא נמצא דבר עבור ״זז״")).toBeInTheDocument();
    expect(leadList).toHaveBeenCalledWith({ search: "זז" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(field).toHaveValue("זז");
    await userEvent.keyboard("{Escape}");
    expect(field).toHaveValue("");
  });
});
