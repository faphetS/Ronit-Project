import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createTestServices, renderApp } from "../../test/app";
import { TEST_PASSWORD } from "../../test/services";
import { SignInScreen } from "./SignInScreen";

const routes = [
  { path: "/login", element: <SignInScreen /> },
  { path: "/", element: <h1>overview</h1> },
  { path: "/customers", element: <h1>customers</h1> },
];

async function continueWithGoogle() {
  await userEvent.click(await screen.findByRole("button", { name: "המשך עם Google" }));
  expect(await screen.findByRole("heading", { name: "קוד אימות" })).toBeInTheDocument();
}

describe("SignInScreen", () => {
  it("signs in with Google and the emailed code, then returns to the page that sent the visitor here", async () => {
    const services = createTestServices();
    renderApp(routes, { path: "/login", state: { from: "/customers" }, services });
    await continueWithGoogle();
    expect(await screen.findByText(/^שלחנו קוד בן 6 ספרות אל \w\*\*\*@/)).toBeInTheDocument();
    expect(await services.session.current()).toBeNull();
    await userEvent.type(screen.getByLabelText("קוד בן 6 ספרות"), "123 456");
    await userEvent.click(screen.getByRole("button", { name: "כניסה" }));
    expect(await screen.findByRole("heading", { name: "customers" })).toBeInTheDocument();
    expect(await services.session.current()).not.toBeNull();
  });

  it("signs in with the username and password, then the emailed code", async () => {
    const services = createTestServices();
    renderApp(routes, { path: "/login", state: { from: "/customers" }, services });
    await userEvent.type(await screen.findByLabelText("שם משתמש או מייל"), "Ronit");
    await userEvent.type(screen.getByLabelText("סיסמה"), TEST_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "כניסה" }));
    expect(await screen.findByRole("heading", { name: "קוד אימות" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("קוד בן 6 ספרות"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "כניסה" }));
    expect(await screen.findByRole("heading", { name: "customers" })).toBeInTheDocument();
  });

  it("asks for both boxes, and says when the username or password is wrong", async () => {
    renderApp(routes, { path: "/login" });
    await userEvent.click(await screen.findByRole("button", { name: "כניסה" }));
    expect(screen.getByRole("status")).toHaveTextContent("צריך למלא שם משתמש וסיסמה.");
    await userEvent.type(screen.getByLabelText("שם משתמש או מייל"), "ronit");
    await userEvent.type(screen.getByLabelText("סיסמה"), "not-the-password");
    await userEvent.click(screen.getByRole("button", { name: "הצגת הסיסמה" }));
    expect(screen.getByLabelText("סיסמה")).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "כניסה" }));
    expect(await screen.findByText("שם המשתמש או הסיסמה לא נכונים.")).toBeInTheDocument();
  });

  it("checks the code is 6 digits before sending it, and sends a new one on request", async () => {
    renderApp(routes, { path: "/login" });
    await continueWithGoogle();
    await userEvent.type(screen.getByLabelText("קוד בן 6 ספרות"), "12345");
    await userEvent.click(screen.getByRole("button", { name: "כניסה" }));
    expect(screen.getByRole("status")).toHaveTextContent("הקוד לא נכון. כדאי לבדוק במייל ולנסות שוב.");
    await userEvent.click(screen.getByRole("button", { name: "שליחה מחדש" }));
    expect(await screen.findByText("שלחנו קוד חדש.")).toBeInTheDocument();
  });

  it("goes back from the code to Google", async () => {
    renderApp(routes, { path: "/login" });
    await continueWithGoogle();
    await userEvent.click(screen.getByRole("button", { name: "חזרה" }));
    expect(screen.getByRole("button", { name: "המשך עם Google" })).toBeInTheDocument();
  });

  it("opens on the code after Google, or starts over when no code is waiting", async () => {
    const services = createTestServices();
    await services.session.startGoogle({ remember: true, returnTo: "/" });
    const first = renderApp(routes, { path: "/login?step=code", services });
    expect(await screen.findByRole("heading", { name: "קוד אימות" })).toBeInTheDocument();
    first.unmount();

    renderApp(routes, { path: "/login?step=code" });
    expect(await screen.findByRole("button", { name: "המשך עם Google" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("עבר יותר מדי זמן. צריך להיכנס שוב.");
  });

  it("says why Google sign-in didn't work, and nothing when it was cancelled", async () => {
    const refused = renderApp(routes, { path: "/login?error=not-registered" });
    expect(await screen.findByRole("status")).toHaveTextContent("החשבון הזה לא רשום במערכת. אפשר לבקש מהמשרד להוסיף אותו.");
    refused.unmount();
    renderApp(routes, { path: "/login?error=cancelled" });
    expect(await screen.findByRole("status")).toHaveTextContent("");
  });

  it("shows the help notice", async () => {
    renderApp(routes, { path: "/login" });
    await userEvent.click(await screen.findByRole("button", { name: "צריכים עזרה?" }));
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
