import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LeadsService, Services } from "../../data/services";
import type { LeadEvent, Role, UserAccount } from "../../data/types";
import { renderApp, signedInServices } from "../../test/app";
import { testLead } from "../../test/leads";
import { RONIT } from "../../test/services";
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
  mentions: [],
  ...overrides,
});

const history: LeadEvent[] = [
  note({}),
  note({ id: "n-2", text: "שוחחנו בטלפון", byUserId: "u-other" }),
  note({ id: "n-3", text: "מונדיי", byUserId: null, author: "אורטל", source: "monday" }),
];

/** Made-up teammates. */
const teammate = (id: string, name: string, role: Role, extra: Partial<UserAccount> = {}): UserAccount => ({
  ...RONIT,
  id,
  name,
  initial: name.charAt(0),
  role,
  email: `${id}@example.com`,
  username: id,
  ...extra,
});

/** Ronit, two people to tag, and a demo account, which is never offered. */
const TEAM: UserAccount[] = [
  RONIT,
  teammate("u-michal", "מיכל לוי", "office"),
  teammate("u-noa", "נועה כהן", "sales"),
  teammate("u-demo", "חשבון הדגמה", "admin", { demo: true }),
];

interface SetupOptions {
  addNote?: LeadsService["addNote"];
  editNote?: LeadsService["editNote"];
  notes?: LeadEvent[];
}

async function setup(role: "admin" | "office", { addNote = vi.fn(async () => note({ id: "n-new", text: "חדש" })), editNote = vi.fn(async () => note({})), notes = history }: SetupOptions = {}) {
  const base = await signedInServices();
  const services: Services = {
    ...base,
    leads: { ...base.leads, addNote, editNote },
    users: { ...base.users, list: async () => ({ users: TEAM, invites: [] }) },
    session: {
      ...base.session,
      current: async () => {
        const current = await base.session.current();
        return current && { ...current, user: { ...current.user, role, id: "u-ronit" } };
      },
    },
  };
  const lead = testLead({ history: notes });
  renderApp([{ path: "/", element: <LeadHistory lead={lead} level={3} /> }], { services });
  return { addNote, editNote };
}

/** The new-note box once the team has loaded, so "@" can list it. */
async function noteBox() {
  const box = await screen.findByRole("combobox", { name: "הערה חדשה" });
  // The authors' names show once the team is in.
  await screen.findAllByText(/רונית/);
  return box;
}

/** The names in the list under the box, in order. */
const optionNames = () =>
  within(screen.getByRole("listbox", { name: "אנשי צוות לתיוג" }))
    .getAllByRole("option")
    .map((option) => option.querySelector("bdi")?.textContent);

describe("LeadHistory notes", () => {
  it("adds a note and clears the box", async () => {
    const { addNote } = await setup("admin");
    const box = await screen.findByRole("combobox", { name: "הערה חדשה" });
    await userEvent.type(box, "חדש");
    await userEvent.click(screen.getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(addNote).toHaveBeenCalledWith("lead-1", "חדש", []));
    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("offers edit and delete only on your own CRM notes (non-admin)", async () => {
    await setup("office");
    await screen.findByRole("combobox", { name: "הערה חדשה" });
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

describe("tagging the team in a note", () => {
  it("lists the team after @, without demo accounts, and narrows it as letters follow", async () => {
    await setup("admin");
    const box = await noteBox();
    expect(box).toHaveAttribute("placeholder", "כתבו הערה על הליד · @ לתיוג");
    expect(box).toHaveAttribute("aria-expanded", "false");
    await userEvent.type(box, "שלום @");
    const list = screen.getByRole("listbox", { name: "אנשי צוות לתיוג" });
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(box).toHaveAttribute("aria-controls", list.id);
    expect(optionNames()).toEqual(["רונית ברש", "מיכל לוי", "נועה כהן"]);
    // A word of the name that starts with the letters: "כהן".
    await userEvent.type(box, "כה");
    expect(optionNames()).toEqual(["נועה כהן"]);
    // No "@" at the start of a word, no list.
    await userEvent.clear(box);
    await userEvent.type(box, "mail@");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("picks with the keyboard: the arrows move, Enter writes the full name", async () => {
    await setup("admin");
    const box = await noteBox();
    await userEvent.type(box, "@");
    const options = screen.getAllByRole("option");
    expect(box).toHaveAttribute("aria-activedescendant", options[0].id);
    await userEvent.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(box).toHaveAttribute("aria-activedescendant", options[2].id);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(box).toHaveValue("@מיכל לוי ");
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(box).not.toHaveAttribute("aria-activedescendant");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("picks with Tab or a click, and Escape closes the list", async () => {
    await setup("admin");
    const box = await noteBox();
    await userEvent.type(box, "@נו");
    await userEvent.keyboard("{Tab}");
    expect(box).toHaveValue("@נועה כהן ");
    expect(box).toHaveFocus();
    await userEvent.type(box, "@");
    await userEvent.click(screen.getByRole("option", { name: /מיכל לוי/ }));
    expect(box).toHaveValue("@נועה כהן @מיכל לוי ");
    await userEvent.type(box, "@");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(box).toHaveValue("@נועה כהן @מיכל לוי @");
  });

  it("saves the people tagged, each once", async () => {
    const { addNote } = await setup("admin");
    const box = await noteBox();
    for (const letters of ["@מי", "@נו", "@מי"]) {
      await userEvent.type(box, letters);
      await userEvent.keyboard("{Enter}");
    }
    await userEvent.type(box, "אפשר לחזור אליה?");
    await userEvent.click(screen.getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(addNote).toHaveBeenCalledWith("lead-1", "@מיכל לוי @נועה כהן @מיכל לוי אפשר לחזור אליה?", ["u-michal", "u-noa"]));
  });

  it("drops a tag whose name was taken out before saving", async () => {
    const { addNote } = await setup("admin");
    const box = await noteBox();
    await userEvent.type(box, "@מי");
    await userEvent.keyboard("{Enter}");
    await userEvent.clear(box);
    await userEvent.type(box, "בלי תיוג");
    await userEvent.click(screen.getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(addNote).toHaveBeenCalledWith("lead-1", "בלי תיוג", []));
  });

  it("starts a tag at the caret from the tag button", async () => {
    await setup("admin");
    const box = await noteBox();
    await userEvent.type(box, "שלום");
    await userEvent.click(screen.getByRole("button", { name: "תיוג" }));
    expect(box).toHaveValue("שלום @");
    expect(box).toHaveFocus();
    expect(screen.getByRole("listbox", { name: "אנשי צוות לתיוג" })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(box).toHaveValue("שלום @רונית ברש ");
  });

  it("edits a note with its tags remembered, and always sends them", async () => {
    const tagged = note({ text: "@נועה כהן תחזרו אליה", mentions: ["u-noa"] });
    const { editNote } = await setup("admin", { notes: [tagged] });
    await userEvent.click(await screen.findByRole("button", { name: "עריכה" }));
    const editor = screen.getByRole("combobox", { name: "עריכת ההערה" });
    expect(editor).toHaveValue("@נועה כהן תחזרו אליה");
    await userEvent.type(editor, " מחר");
    await userEvent.click(within(editor.closest("li")!).getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(editNote).toHaveBeenCalledWith("lead-1", "n-1", "@נועה כהן תחזרו אליה מחר", ["u-noa"]));
  });

  it("highlights the people a note tags, and leaves other @ text plain", async () => {
    await setup("admin", {
      notes: [
        note({ text: "@מיכל לוי אפשר לחזור אליה? @נועה כהן", mentions: ["u-michal"] }),
        note({ id: "n-2", text: "@מישהו אחר", mentions: ["u-gone"] }),
      ],
    });
    const chip = await screen.findByText("@מיכל לוי");
    expect(chip.tagName).toBe("BDI");
    expect(chip).toHaveClass("bg-gold/25");
    const notes = screen.getByRole("list", { name: "הערות ושיחות" });
    // Noa is named but not tagged, and nobody in the team has the other id.
    expect(notes.querySelectorAll("bdi[data-mention]")).toHaveLength(1);
    expect(screen.getByText("@מישהו אחר").tagName).toBe("P");
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
