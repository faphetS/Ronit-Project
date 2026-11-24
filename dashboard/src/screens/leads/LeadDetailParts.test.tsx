import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/app";
import { testLead } from "../../test/leads";
import { LeadExtras } from "./LeadDetailParts";

describe("LeadExtras", () => {
  it("shows the next step and the last message, with no outside tool or link", () => {
    renderApp([{ path: "/", element: <LeadExtras lead={testLead({ nextStep: "לשלוח הצעת מחיר", lastMessage: "מתי הטיסה?" })} /> }]);
    expect(screen.getByText("לשלוח הצעת מחיר")).toBeInTheDocument();
    expect(screen.getByText("מתי הטיסה?")).toBeInTheDocument();
    expect(screen.queryByText(/Monday/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows nothing when there is neither", () => {
    renderApp([{ path: "/", element: <LeadExtras lead={testLead()} /> }]);
    expect(screen.queryByText("שלב הבא")).not.toBeInTheDocument();
    expect(screen.queryByText("הודעה אחרונה באינסטגרם")).not.toBeInTheDocument();
  });
});
