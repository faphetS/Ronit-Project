import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Services } from "../../data/services";
import type { GroupParticipant, GroupSummary } from "../../data/types";
import { renderApp, signedInServices } from "../../test/app";
import { testLead } from "../../test/leads";
import { GroupsScreen } from "./GroupsScreen";

const group = (overrides: Partial<GroupSummary>): GroupSummary => ({
  id: "g-crm",
  name: "ריטרט מבחן",
  shortName: "ריטרט מבחן",
  type: "event",
  womenOnly: false,
  capacity: 20,
  startsOn: "2099-01-10",
  endsOn: null,
  dateLabel: null,
  flight: null,
  mondayBoard: null,
  fromCrm: true,
  registered: 2,
  passportsReceived: 0,
  missingPassports: 0,
  readiness: null,
  ...overrides,
});

const person = (id: string, addedInCrm: boolean): GroupParticipant => ({
  id,
  customerId: `c-${id}`,
  firstName: `שם${id}`,
  lastName: "בדיקה",
  phone: "0540000009",
  passport: "missing",
  passportExpiry: null,
  passportExpiringSoon: false,
  note: null,
  mondayPassport: null,
  mondayStatus: null,
  eventOn: null,
  addedInCrm,
});

async function setup(groups: GroupSummary[], overrides: Partial<Services["groups"]> = {}, path = "/groups/g-crm") {
  const base = await signedInServices();
  const services: Services = {
    ...base,
    leads: { ...base.leads, list: async () => [testLead({ id: "lead-9", name: "דנה כהן" })] },
    groups: {
      ...base.groups,
      list: async () => groups,
      participants: async () => [person("p-crm", true), person("p-monday", false)],
      ...overrides,
    },
  };
  renderApp(
    [
      { path: "/groups", element: <GroupsScreen /> },
      { path: "/groups/:groupId", element: <GroupsScreen /> },
    ],
    { services, path },
  );
  return services;
}

describe("groups made in the CRM", () => {
  it("creates a group and goes to it", async () => {
    const create = vi.fn(async () => group({ id: "g-new", name: "חדשה", fromCrm: true }));
    await setup([group({})], { create }, "/groups");
    await userEvent.click(await screen.findByRole("button", { name: "קבוצה חדשה" }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "שם הקבוצה" }), "חדשה");
    await userEvent.click(within(sheet).getByRole("button", { name: "פרויקט" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "יצירת הקבוצה" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "חדשה", type: "project" })));
  });

  it("shows edit and remove on a CRM group, not on a Monday group", async () => {
    await setup([group({}), group({ id: "g-mon", name: "מונדיי", shortName: "מונדיי", fromCrm: false })], {}, "/groups/g-crm");
    expect(await screen.findByRole("button", { name: "עריכה" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הסרת הקבוצה" })).toBeInTheDocument();
  });

  it("has no edit or remove on a Monday group", async () => {
    await setup([group({ id: "g-mon", name: "מונדיי", shortName: "מונדיי", fromCrm: false })], {}, "/groups/g-mon");
    await screen.findByRole("searchbox", { name: "חיפוש ליד" });
    expect(screen.queryByRole("button", { name: "עריכה" })).toBeNull();
    expect(screen.queryByRole("button", { name: "הסרת הקבוצה" })).toBeNull();
  });

  it("searches for a lead and adds her", async () => {
    const addLead = vi.fn(async () => ({ customerId: "c-1", alreadyMember: false }));
    await setup([group({})], { addLead });
    await userEvent.type(await screen.findByRole("searchbox", { name: "חיפוש ליד" }), "דנ");
    const row = (await screen.findByText("דנה כהן")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "הוספה" }));
    await waitFor(() => expect(addLead).toHaveBeenCalledWith("g-crm", "lead-9"));
  });

  it("offers removal only for people added in the CRM", async () => {
    await setup([group({})]);
    await screen.findByText("שםp-crm בדיקה");
    expect(screen.getAllByRole("button", { name: /^הסרה/ })).toHaveLength(1);
  });
});
