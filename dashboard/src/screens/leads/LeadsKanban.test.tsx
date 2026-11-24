import { screen, within } from "@testing-library/react";
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
});
