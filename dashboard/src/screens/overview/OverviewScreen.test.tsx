import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp, signedInServices } from "../../test/app";
import { OverviewScreen } from "./OverviewScreen";

const routes = [
  { path: "/", element: <OverviewScreen /> },
  { path: "/leads", element: <h1>leads</h1> },
];

describe("OverviewScreen", () => {
  it("shows this week's leads and the key numbers", async () => {
    renderApp(routes, { services: await signedInServices() });
    const week = await screen.findByRole("region", { name: "לידים השבוע" });
    expect(await within(week).findByText("14")).toBeInTheDocument();
    expect(week).toHaveTextContent("6 חדשים · 5 בשיחה · 3 נרשמו");
    const numbers = screen.getByLabelText("המספרים של היום");
    expect(numbers).toHaveTextContent("לידים פתוחים24");
    expect(numbers).toHaveTextContent("לקוחות412");
    expect(numbers).toHaveTextContent("קבוצות פעילות4");
  });

  it("offers a retry when the numbers fail to load", async () => {
    renderApp(routes, { services: await signedInServices({ failing: new Set(["overview"] as const) }) });
    expect(await screen.findByRole("alert")).toHaveTextContent("משהו השתבש בטעינה.");
    expect(screen.getByRole("button", { name: "לנסות שוב" })).toBeInTheDocument();
  });

  it("opens all leads from the week card", async () => {
    renderApp(routes, { services: await signedInServices() });
    await userEvent.click(await screen.findByRole("link", { name: "לכל הלידים" }));
    expect(await screen.findByRole("heading", { name: "leads" })).toBeInTheDocument();
  });

  it("shows today with the Hebrew date and the next holiday", async () => {
    renderApp(routes, { services: await signedInServices() });
    const todayCard = await screen.findByRole("region", { name: "היום" });
    expect(todayCard).toHaveTextContent("י״ז בחשוון תשפ״ז");
    expect(todayCard).toHaveTextContent("חנוכה בעוד 37 ימים");
  });
});
