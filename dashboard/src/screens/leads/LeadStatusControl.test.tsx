import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Lead, SettableLeadStatus } from "../../data/types";
import { renderApp, signedInServices } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadStatusControl } from "./LeadStatusControl";

describe("LeadStatusControl", () => {
  it("lets people with full access give the lead another status", async () => {
    const services = await signedInServices();
    const lead = testLead({ status: "details-sent" });
    const setStatus = vi.fn(async (_id: string, status: SettableLeadStatus): Promise<Lead> => ({ ...lead, status }));
    services.leads.setStatus = setStatus;
    renderApp([{ path: "/", element: <LeadStatusControl lead={lead} /> }], { services });
    const menu = await screen.findByRole("combobox", { name: "שינוי סטטוס" });
    expect(menu).toHaveValue("working");
    await userEvent.selectOptions(menu, "no-answer");
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(lead.id, "no-answer"));
  });

  it("keeps saying details sent on the selected In progress option", async () => {
    const services = await signedInServices();
    renderApp([{ path: "/", element: <LeadStatusControl lead={testLead({ status: "details-sent" })} /> }], { services });
    const menu = await screen.findByRole("combobox", { name: "שינוי סטטוס" });
    expect(within(menu).getByRole("option", { selected: true })).toHaveTextContent("נשלחו פרטים");
  });

  it("shows the status as a tag to people who may only look", async () => {
    const services = await signedInServices();
    const table = await services.users.permissions();
    const permissions = vi.fn(async () => table.map((row) => (row.area === "leads" ? { ...row, access: { ...row.access, admin: "view" as const } } : row)));
    services.users.permissions = permissions;
    renderApp([{ path: "/", element: <LeadStatusControl lead={testLead({ status: "talking" })} /> }], { services });
    await waitFor(() => expect(permissions).toHaveBeenCalled());
    expect(await screen.findByText("בשיחה")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
