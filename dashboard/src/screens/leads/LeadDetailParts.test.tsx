import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadInMonday } from "./LeadDetailParts";

describe("LeadInMonday", () => {
  it("says when a status changed here hasn't reached Monday yet", () => {
    renderApp([{ path: "/", element: <LeadInMonday lead={testLead({ mondayPending: true })} level={3} /> }]);
    expect(screen.getByRole("status")).toHaveTextContent("הסטטוס עוד לא הגיע ל-Monday");
  });

  it("says nothing about it once Monday is in step", () => {
    renderApp([{ path: "/", element: <LeadInMonday lead={testLead()} level={3} /> }]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
