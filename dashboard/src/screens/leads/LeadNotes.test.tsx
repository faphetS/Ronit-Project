import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Services } from "../../data/services";
import type { LeadEvent } from "../../data/types";
import { renderApp, signedInServices } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadGroups, LeadHistory } from "./LeadDetailParts";

const note = (overrides: Partial<LeadEvent>): LeadEvent => ({
  id: "n-1",
  at: "2026-10-27T08:00:00.000Z",
  text: "ביקשה מחיר",
  byUserId: "u-ronit",
  author: null,
  mondayBoard: null,
  source: "crm",
  editedAt: null,
  ...overrides,
});

const history: LeadEvent[] = [
  note({}),
  note({ id: "n-2", text: "שוחחנו בטלפון", byUserId: "u-other" }),
  note({ id: "n-3", text: "מונדיי", byUserId: null, author: "אורטל", source: "monday" }),
];

async function setup(role: "admin" | "office", addNote = vi.fn(async () => note({ id: "n-new", text: "חדש" }))) {
  const base = await signedInServices();
  const services: Services = {
    ...base,
    leads: { ...base.leads, addNote },
    session: {
      ...base.session,
      current: async () => {
        const current = await base.session.current();
        return current && { ...current, user: { ...current.user, role, id: "u-ronit" } };
      },
    },
  };
  const lead = testLead({ history });
  renderApp([{ path: "/", element: <LeadHistory lead={lead} level={3} /> }], { services });
  return { addNote };
}

describe("LeadHistory notes", () => {
  it("adds a note and clears the box", async () => {
    const { addNote } = await setup("admin");
    const box = await screen.findByRole("textbox", { name: "הערה חדשה" });
    await userEvent.type(box, "חדש");
    await userEvent.click(screen.getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(addNote).toHaveBeenCalledWith("lead-1", "חדש"));
    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("offers edit and delete only on your own CRM notes (non-admin)", async () => {
    await setup("office");
    await screen.findByRole("textbox", { name: "הערה חדשה" });
    expect(screen.getAllByRole("button", { name: "עריכה" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "מחיקה" })).toHaveLength(1);
  });

  it("offers edit on every CRM note to an admin, never on Monday notes", async () => {
    await setup("admin");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "עריכה" })).toHaveLength(2));
  });

  it("shows earlier notes with their author and no outside tool named", async () => {
    await setup("admin");
    const item = (await screen.findByText("מונדיי")).closest("li")!;
    expect(within(item).queryByText("Monday")).not.toBeInTheDocument();
    expect(within(item).getByText(/אורטל/)).toBeInTheDocument();
  });
});

describe("LeadGroups", () => {
  it("links to each group", () => {
    renderApp([{ path: "/", element: <LeadGroups lead={testLead({ groups: [{ id: "g-1", name: "אומן חנוכה", type: "flight" }] })} level={3} /> }]);
    expect(screen.getByRole("link", { name: "אומן חנוכה" })).toHaveAttribute("href", "/groups/g-1");
  });

  it("says when there are none", () => {
    renderApp([{ path: "/", element: <LeadGroups lead={testLead()} level={3} /> }]);
    expect(screen.getByText("עוד לא בקבוצה")).toBeInTheDocument();
  });
});
