import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Services } from "../../data/services";
import type { MentionFeed, UserAccount } from "../../data/types";
import { renderApp, RoleKnown, signedInAs, signedInServices } from "../../test/app";
import { RONIT } from "../../test/services";
import { setViewportWidth } from "../../test/viewport";
import { PhoneTopBar } from "../phone/PhoneTopBar";
import { useNavBadges } from "../useNavBadges";
import { NotificationsMenu } from "./NotificationsMenu";

/** The desktop bell with the count the shell gives it. */
function Bell() {
  return <NotificationsMenu count={useNavBadges().notifications} />;
}

const MICHAL: UserAccount = { ...RONIT, id: "u-michal", name: "מיכל לוי", initial: "מ", role: "office", email: "michal@example.com", username: "michal" };

const LONG_NOTE = "@רונית ברש אפשר לחזור אליה היום? היא שאלה על חדר יחיד בטיסה, ועל הנחה למשפחות שנרשמות יחד עם עוד שתי חברות";

/** Three tags of Ronit on made-up leads, two of them unread. The clock stands at 13:30 UTC. */
function feed(): MentionFeed {
  return {
    unread: 2,
    items: [
      { noteId: "n-1", leadId: "lead-1", leadName: "יעל פרץ", byUserId: "u-michal", at: "2026-10-28T12:50:00.000Z", text: LONG_NOTE, seen: false },
      { noteId: "n-2", leadId: "lead-2", leadName: "שירה כהן", byUserId: "u-michal", at: "2026-10-28T10:00:00.000Z", text: "@רונית ברש נרשמה", seen: true },
      { noteId: "n-3", leadId: "lead-3", leadName: "מאיה לוי", byUserId: null, at: "2026-10-27T09:00:00.000Z", text: "@רונית ברש לבדוק את הדרכון", seen: false },
    ],
  };
}

/** The test services' passports (one waits for a check), Michal in the team, and the tags; marking reads them on the "server". */
async function setup(element: ReactElement, { mentions = feed(), alerts = true }: { mentions?: MentionFeed; alerts?: boolean } = {}) {
  const base = await signedInServices();
  let current = mentions;
  const markMentionsSeen = vi.fn(async (noteIds?: string[]) => {
    const items = current.items.map((item) => (!noteIds || noteIds.includes(item.noteId) ? { ...item, seen: true } : item));
    current = { unread: items.filter((item) => !item.seen).length, items };
    return { unread: current.unread };
  });
  const services: Services = {
    ...base,
    leads: { ...base.leads, mentions: async () => current, markMentionsSeen },
    customers: alerts ? base.customers : { ...base.customers, intakes: async () => [] },
    users: { ...base.users, list: async () => ({ users: [RONIT, MICHAL], invites: [] }) },
  };
  const view = renderApp([{ path: "*", element }], { services });
  return { ...view, markMentionsSeen };
}

const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("the bell", () => {
  it("counts unread tags, and lists the alerts, then the tags, unread first", async () => {
    await setup(<Bell />);
    // One passport waits for a check, and two tags are unread.
    const bell = await screen.findByRole("button", { name: "התראות, 3 חדשות" });
    expect(bell).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(bell);
    const panel = screen.getByRole("dialog", { name: "התראות" });
    expect(bell).toHaveAttribute("aria-expanded", "true");
    const rows = within(panel).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/customers", "/leads/lead-1", "/leads/lead-3", "/leads/lead-2"]);
    expect(rows[0]).toHaveTextContent("דרכון ממתין לבדיקה");
    expect(rows[0]).toHaveTextContent("פנינה לוי");
    expect(rows[1]).toHaveTextContent("תיוג בהערה · יעל פרץ");
    // The author's first name and the note's first 80 or so characters.
    expect(rows[1]).toHaveTextContent(`מיכל: ${Array.from(LONG_NOTE).slice(0, 80).join("").trimEnd()}…`);
    expect(rows[1]).toHaveTextContent("לפני 40 דקות");
    expect(rows[2]).toHaveTextContent("@רונית ברש לבדוק את הדרכון");
    expect(rows[2]).toHaveTextContent("אתמול");
    // A dot on each unread tag, and words for screen readers.
    expect(panel.querySelectorAll("[data-unread]")).toHaveLength(2);
    expect(within(rows[1]).getByText(", לא נקרא")).toHaveClass("sr-only");
    expect(within(rows[3]).queryByText(", לא נקרא")).not.toBeInTheDocument();
  });

  it("opens the lead from a tag, and marks the tag read", async () => {
    const { router, markMentionsSeen } = await setup(<Bell />);
    await userEvent.click(await screen.findByRole("button", { name: "התראות, 3 חדשות" }));
    await userEvent.click(screen.getByRole("link", { name: /יעל פרץ/ }));
    expect(markMentionsSeen).toHaveBeenCalledWith(["n-1"]);
    expect(router.state.location.pathname).toBe("/leads/lead-1");
    await closed();
    expect(await screen.findByRole("button", { name: "התראות, 2 חדשות" })).toBeInTheDocument();
  });

  it("marks every tag read", async () => {
    const { markMentionsSeen } = await setup(<Bell />);
    await userEvent.click(await screen.findByRole("button", { name: "התראות, 3 חדשות" }));
    const panel = screen.getByRole("dialog", { name: "התראות" });
    await userEvent.click(within(panel).getByRole("button", { name: "סימון הכול כנקרא" }));
    expect(markMentionsSeen).toHaveBeenCalledWith(undefined);
    await waitFor(() => expect(panel.querySelectorAll("[data-unread]")).toHaveLength(0));
    expect(within(panel).queryByRole("button", { name: "סימון הכול כנקרא" })).not.toBeInTheDocument();
    expect(panel).toHaveFocus();
    // The passport still waits.
    expect(screen.getByRole("button", { name: "התראות, 1 חדשות" })).toBeInTheDocument();
  });

  it("says when there is nothing new", async () => {
    await setup(<Bell />, { mentions: { unread: 0, items: [] }, alerts: false });
    await userEvent.click(await screen.findByRole("button", { name: "התראות, 0 חדשות" }));
    expect(await within(screen.getByRole("dialog", { name: "התראות" })).findByText("אין התראות חדשות")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "סימון הכול כנקרא" })).not.toBeInTheDocument();
  });

  it("closes on Escape, with the focus back on the bell, and on a click outside", async () => {
    await setup(<Bell />);
    const bell = await screen.findByRole("button", { name: "התראות, 3 חדשות" });
    await userEvent.click(bell);
    expect(screen.getByRole("dialog", { name: "התראות" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await closed();
    expect(bell).toHaveFocus();
    await userEvent.click(bell);
    expect(screen.getByRole("dialog", { name: "התראות" })).toBeInTheDocument();
    await userEvent.click(document.body);
    await closed();
  });

  it("never asks for tags, passports or greetings that the role table keeps from the person", async () => {
    // Sales with Leads closed too: by the starting table, sales has no passports or greetings either.
    const base = await signedInAs("sales");
    const mentions = vi.fn(async () => feed());
    const intakes = vi.fn(base.customers.intakes);
    const campaign = vi.fn(base.greetings.current);
    const services: Services = {
      ...base,
      users: {
        ...base.users,
        permissions: async () => (await base.users.permissions()).map((row) => (row.area === "leads" ? { ...row, access: { ...row.access, sales: "none" } } : row)),
      },
      leads: { ...base.leads, mentions },
      customers: { ...base.customers, intakes },
      greetings: { ...base.greetings, current: campaign },
    };
    renderApp([{ path: "*", element: <><Bell /><RoleKnown /></> }], { services });
    await screen.findByText("role known");
    await userEvent.click(screen.getByRole("button", { name: "התראות, 0 חדשות" }));
    const panel = screen.getByRole("dialog", { name: "התראות" });
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
    expect(within(panel).getByText("אין התראות חדשות")).toBeInTheDocument();
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
    expect(mentions).not.toHaveBeenCalled();
    expect(intakes).not.toHaveBeenCalled();
    expect(campaign).not.toHaveBeenCalled();
  });

  it("opens in a sheet on phones", async () => {
    setViewportWidth(390);
    const { router, markMentionsSeen } = await setup(<PhoneTopBar />);
    await userEvent.click(await screen.findByRole("button", { name: "התראות, 3 חדשות" }));
    const sheet = screen.getByRole("dialog", { name: "התראות" });
    await userEvent.click(within(sheet).getByRole("button", { name: "סימון הכול כנקרא" }));
    expect(markMentionsSeen).toHaveBeenCalledWith(undefined);
    await userEvent.click(within(sheet).getByRole("link", { name: /מאיה לוי/ }));
    expect(router.state.location.pathname).toBe("/leads/lead-3");
    await closed();
  });
});
