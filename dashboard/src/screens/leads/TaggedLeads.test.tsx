import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LeadFilters, Services } from "../../data/services";
import type { UserAccount } from "../../data/types";
import { renderApp, signedInServices } from "../../test/app";
import { testLead } from "../../test/leads";
import { RONIT } from "../../test/services";
import { LeadsDesktopPage } from "./LeadsDesktopPage";
import { LeadsKanban } from "./LeadsKanban";
import { LeadsPhoneList } from "./LeadsPhoneList";
import { readLeadsUrl, toLeadFilters } from "./leads-url";

const MICHAL: UserAccount = { ...RONIT, id: "u-michal", name: "מיכל לוי", initial: "מ", role: "office", email: "michal@example.com", username: "michal" };

/** Made-up leads: one tags Ronit (the signed-in person) and Michal, one tags nobody. */
const LEADS = [testLead({ id: "a", name: "יעל דהן", tagged: [RONIT.id, MICHAL.id] }), testLead({ id: "b", name: "מאיה לוי", status: "new" })];

/** Ronit signed in with Michal on the team; the leads list answers from LEADS, and "tagged=me" keeps Ronit's. */
async function servicesWithLeads() {
  const base = await signedInServices();
  const list = vi.fn(async (filters: LeadFilters = {}) =>
    LEADS.filter((lead) => filters.status !== "not-relevant" && (filters.tagged !== "me" || lead.tagged.includes(RONIT.id))),
  );
  const services: Services = {
    ...base,
    leads: { ...base.leads, list },
    users: { ...base.users, list: async () => ({ users: [RONIT, MICHAL], invites: [] }) },
  };
  return { services, list };
}

const TAGGED_NAMES = "מתויגים: רונית ברש, מיכל לוי";

describe("tags on the leads", () => {
  it("keeps 'tagged me' in the address, and asks for it", () => {
    const state = readLeadsUrl(new URLSearchParams("tagged=me&day=all"));
    expect(state.tagged).toBe("me");
    expect(toLeadFilters(state, { status: false, search: false, day: true })).toEqual({ tagged: "me" });
    expect(readLeadsUrl(new URLSearchParams("tagged=someone")).tagged).toBe("all");
  });

  it("rings a tagged lead's card in gold, with the faces and first names of who is tagged", async () => {
    const { services } = await servicesWithLeads();
    type Settled = Parameters<typeof LeadsKanban>[0]["open"];
    const open = { data: LEADS, isPending: false, isError: false, isUpdating: false, refetch: async () => undefined } as unknown as Settled;
    const none = { ...open, data: [] } as unknown as Settled;
    renderApp([{ path: "/leads", element: <LeadsKanban open={open} closed={none} leadHref={(id) => `/leads/${id}`} /> }], { path: "/leads", services });
    const card = screen.getByText("יעל דהן").closest("li") as HTMLElement;
    expect(card.className).toContain("ring-gold");
    expect(await within(card).findByText(TAGGED_NAMES)).toBeInTheDocument();
    expect(within(card).getByText("רונית, מיכל")).toBeInTheDocument();
    const plain = screen.getByText("מאיה לוי").closest("li") as HTMLElement;
    expect(plain.className).not.toContain("ring-gold");
    expect(within(plain).queryByText(/מתויגים/)).not.toBeInTheDocument();
  });

  it("filters the board to the leads that tag you, on every day, and goes back to today", async () => {
    const { services, list } = await servicesWithLeads();
    const { router } = renderApp([{ path: "/leads", element: <LeadsDesktopPage /> }], { path: "/leads", services });
    const chip = await screen.findByRole("button", { name: "תויגתי" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(new URLSearchParams(router.state.location.search).get("tagged")).toBe("me");
    expect(new URLSearchParams(router.state.location.search).get("day")).toBe("all");
    await waitFor(() => expect(list).toHaveBeenCalledWith({ tagged: "me" }));
    expect(screen.getByRole("heading", { name: "הלידים שתויגת בהם, לפי סטטוס" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("מאיה לוי")).not.toBeInTheDocument());
    expect(screen.getByText("יעל דהן")).toBeInTheDocument();
    await userEvent.click(chip);
    expect(router.state.location.search).toBe("");
  });

  it("outlines tagged rows on phones, with their faces, and filters them too", async () => {
    const { services, list } = await servicesWithLeads();
    renderApp([{ path: "/leads", element: <LeadsPhoneList /> }], { path: "/leads", services });
    const row = (await screen.findByText("יעל דהן")).closest("li") as HTMLElement;
    expect(row.className).toContain("ring-gold");
    expect(await within(row).findByText(TAGGED_NAMES)).toBeInTheDocument();
    expect((screen.getByText("מאיה לוי").closest("li") as HTMLElement).className).not.toContain("ring-gold");
    await userEvent.click(screen.getByRole("button", { name: "תויגתי" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ tagged: "me" }));
    await waitFor(() => expect(screen.queryByText("מאיה לוי")).not.toBeInTheDocument());
  });
});
