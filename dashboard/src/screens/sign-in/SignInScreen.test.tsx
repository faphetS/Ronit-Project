import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createTestServices, renderApp } from "../../test/app";
import { SignInScreen } from "./SignInScreen";

const routes = [
  { path: "/login", element: <SignInScreen /> },
  { path: "/", element: <h1>overview</h1> },
  { path: "/customers", element: <h1>customers</h1> },
];

describe("SignInScreen", () => {
  it("signs in and returns to the page that sent the visitor here", async () => {
    const services = createTestServices();
    renderApp(routes, { path: "/login", state: { from: "/customers" }, services });
    await userEvent.type(await screen.findByLabelText("כתובת אימייל"), "ronit@example.com");
    await userEvent.type(screen.getByLabelText("סיסמה"), "demo");
    await userEvent.click(screen.getByRole("button", { name: "כניסה" }));
    expect(await screen.findByRole("heading", { name: "customers" })).toBeInTheDocument();
    expect(await services.session.current()).not.toBeNull();
  });

  it("shows the forgot-password and help notices", async () => {
    renderApp(routes, { path: "/login" });
    await userEvent.click(await screen.findByRole("button", { name: "שכחתי" }));
    expect(screen.getByRole("status")).toHaveTextContent("שלחנו קישור לאיפוס הסיסמה לכתובת האימייל.");
    await userEvent.click(screen.getByRole("button", { name: "צריכים עזרה?" }));
    expect(screen.getByRole("status")).toHaveTextContent("אפשר לפנות למשרד בוואטסאפ או בטלפון.");
  });

  it("counts down to the next holiday on the date card", async () => {
    renderApp(routes, { path: "/login" });
    const card = await screen.findByRole("region", { name: "היום" });
    expect(card).toHaveTextContent("רביעי");
    expect(card).toHaveTextContent("28.10");
    expect(card).toHaveTextContent("י״ז בחשוון תשפ״ז");
    expect(within(card).getByText("חנוכה בעוד 37 ימים")).toBeInTheDocument();
  });
});
