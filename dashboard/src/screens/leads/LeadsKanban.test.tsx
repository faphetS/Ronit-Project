import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Lead } from "../../data/types";
import { renderApp } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadsKanban } from "./LeadsKanban";

type Settled = Parameters<typeof LeadsKanban>[0]["open"];
const settled = (data: Lead[]) => ({ data, isPending: false, isError: false, isUpdating: false, refetch: async () => undefined }) as unknown as Settled;

function renderBoard(open: Lead[], closed: Lead[], canMove: boolean) {
  return renderApp(
    [{ path: "/leads", element: <LeadsKanban open={settled(open)} closed={settled(closed)} leadHref={(id) => `/leads/${id}`} canMove={canMove} /> }],
    { path: "/leads" },
  );
}

describe("LeadsKanban", () => {
  it("lays the open and not-relevant leads out by status, once each", () => {
    renderBoard(
      [testLead({ id: "a", name: "יעל דהן", status: "details-sent" }), testLead({ id: "c", name: "חנה פרץ", status: "not-relevant" })],
      [testLead({ id: "b", name: "מאיה לוי", status: "not-relevant" })],
      true,
    );
    expect(within(screen.getByRole("region", { name: /בטיפול/ })).getByText("יעל דהן")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /לא רלוונטי/ })).toHaveTextContent("2");
  });

  it("lets cards drag only for people who may change statuses", () => {
    const { unmount } = renderBoard([testLead({ id: "a", name: "יעל דהן" })], [], true);
    expect(screen.getByText("יעל דהן").closest("li")).toHaveAttribute("data-draggable", "true");
    unmount();
    renderBoard([testLead({ id: "a", name: "יעל דהן" })], [], false);
    expect(screen.getByText("יעל דהן").closest("li")).not.toHaveAttribute("data-draggable");
  });

  it("shows each card's latest note, a question or an answer labelled", () => {
    renderBoard([testLead({ id: "a", name: "יעל דהן", lastNote: "מתי הטיסה?", lastNoteCategory: "question" }), testLead({ id: "b", name: "מאיה לוי", lastNote: "התקשרתי" })], [], true);
    expect(screen.getByText("מתי הטיסה?").closest("p")).toHaveTextContent(/^שאלה/);
    expect(screen.getByText("התקשרתי").closest("p")).toHaveTextContent(/^התקשרתי$/);
  });

  it("while picking, a press picks a card, the heading's check picks the column's cards, and nothing drags", async () => {
    const picks: Array<[readonly string[], boolean]> = [];
    renderApp(
      [
        {
          path: "/leads",
          element: (
            <LeadsKanban
              open={settled([testLead({ id: "a", name: "יעל דהן" }), testLead({ id: "b", name: "מאיה לוי" })])}
              closed={settled([])}
              leadHref={(id) => `/leads/${id}`}
              canMove
              picking={{ picked: new Set(["b"]), onPick: (ids, on) => picks.push([ids, on]) }}
            />
          ),
        },
      ],
      { path: "/leads" },
    );
    expect(screen.getByRole("checkbox", { name: "בחירת מאיה לוי" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("checkbox", { name: "בחירת יעל דהן" }));
    expect(picks).toEqual([[["a"], true]]);
    const column = screen.getByRole("checkbox", { name: "בחירת כל הכרטיסים בעמודה בטיפול" });
    expect(column).toHaveAttribute("aria-checked", "mixed");
    await userEvent.click(column);
    expect(picks[1]).toEqual([["a", "b"], true]);
    expect(screen.getByText("יעל דהן").closest("li")).not.toHaveAttribute("data-draggable");
    expect(screen.queryByRole("link", { name: "יעל דהן" })).not.toBeInTheDocument();
  });
});
