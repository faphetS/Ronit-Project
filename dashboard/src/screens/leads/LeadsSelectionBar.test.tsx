import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LeadsService } from "../../data/services";
import type { LeadEvent } from "../../data/types";
import { renderApp, signedInServices } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadsSelectionBar } from "./LeadsSelectionBar";

const PICKED = [testLead({ id: "a", name: "יעל דהן", status: "new" }), testLead({ id: "b", name: "מאיה לוי", status: "talking" })];

async function setup(leads: Partial<LeadsService>) {
  const base = await signedInServices();
  const onKeep = vi.fn();
  const onDone = vi.fn();
  renderApp([{ path: "/", element: <LeadsSelectionBar leads={PICKED} onKeep={onKeep} onDone={onDone} /> }], {
    services: { ...base, leads: { ...base.leads, ...leads } },
  });
  return { onKeep, onDone };
}

describe("LeadsSelectionBar", () => {
  it("moves the picked leads to a column, leaving out the ones already in it", async () => {
    const setStatus = vi.fn<LeadsService["setStatus"]>(async (id, status) => testLead({ id, status }));
    const { onKeep } = await setup({ setStatus });
    expect(screen.getByText("2 לידים נבחרו")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "העברה לעמודה" }), "working");
    await waitFor(() => expect(onKeep).toHaveBeenCalledWith([]));
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith("a", "talking");
  });

  it("keeps the leads a move didn't reach picked", async () => {
    const setStatus = vi.fn<LeadsService["setStatus"]>(async (id, status) => {
      if (id === "b") throw new Error("offline");
      return testLead({ id, status });
    });
    const { onKeep } = await setup({ setStatus });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "העברה לעמודה" }), "registered");
    await waitFor(() => expect(onKeep).toHaveBeenCalledWith(["b"]));
  });

  it("writes one note, with its kind, on every picked lead", async () => {
    const addNote = vi.fn<LeadsService["addNote"]>(async (_id, text) => ({ id: "n", at: "2026-11-26T08:00:00.000Z", text, byUserId: "u-ronit", author: null, mondayBoard: null, source: "crm", editedAt: null, mentions: [], category: "question" }) satisfies LeadEvent);
    const { onKeep } = await setup({ addNote });
    await userEvent.click(screen.getByRole("button", { name: "תיוג איש צוות" }));
    await userEvent.type(await screen.findByRole("combobox", { name: "ההערה" }), "מי חוזרת אליהן?");
    await userEvent.click(screen.getByRole("button", { name: "שאלה" }));
    await userEvent.click(screen.getByRole("button", { name: "שמירה ב-2 לידים" }));
    await waitFor(() => expect(onKeep).toHaveBeenCalledWith([]));
    expect(addNote).toHaveBeenCalledTimes(2);
    expect(addNote).toHaveBeenCalledWith("a", "מי חוזרת אליהן?", [], "question");
    expect(addNote).toHaveBeenCalledWith("b", "מי חוזרת אליהן?", [], "question");
  });

  it("stops picking with סיום", async () => {
    const { onDone } = await setup({});
    await userEvent.click(screen.getByRole("button", { name: "סיום" }));
    expect(onDone).toHaveBeenCalled();
  });
});
