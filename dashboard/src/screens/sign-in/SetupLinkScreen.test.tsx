import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createTestServices, renderApp } from "../../test/app";
import { SetupLinkScreen } from "./SetupLinkScreen";

const routes = [
  { path: "/setup/:token", element: <SetupLinkScreen /> },
  { path: "/", element: <h1>overview</h1> },
  { path: "/login", element: <h1>login</h1> },
];

describe("SetupLinkScreen", () => {
  it("sets the password, then the codes, then signs in", async () => {
    const services = createTestServices();
    renderApp(routes, { path: "/setup/demo", services });
    expect(await screen.findByRole("heading", { name: "ברוכים הבאים" })).toBeInTheDocument();
    expect(screen.getByText("בוחרים סיסמה לחשבון של רונית ברש.")).toBeInTheDocument();
    expect(screen.getByLabelText("כתובת אימייל")).toHaveAttribute("readonly");

    await userEvent.type(screen.getByLabelText("סיסמה חדשה"), "a long password");
    await userEvent.type(screen.getByLabelText("שוב, לאימות"), "a long passw0rd");
    await userEvent.click(screen.getByRole("button", { name: "המשך" }));
    expect(screen.getByRole("status")).toHaveTextContent("הסיסמאות לא זהות.");

    await userEvent.clear(screen.getByLabelText("שוב, לאימות"));
    await userEvent.type(screen.getByLabelText("שוב, לאימות"), "a long password");
    await userEvent.click(screen.getByRole("button", { name: "המשך" }));
    expect(await screen.findByRole("heading", { name: "אימות דו-שלבי" })).toBeInTheDocument();
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("קוד בן 6 ספרות"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "אישור" }));
    expect(await screen.findByRole("heading", { name: "overview" })).toBeInTheDocument();
    expect(await services.session.current()).not.toBeNull();
  });

  it("says when the link no longer works", async () => {
    renderApp(routes, { path: "/setup/expired-link" });
    expect(await screen.findByText("הקישור כבר לא בתוקף. אפשר לבקש קישור חדש מהמשרד.")).toBeInTheDocument();
  });
});
