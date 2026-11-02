import { describe, expect, it } from "vitest";
import { inviteEmail, signInCodeEmail } from "./auth.emails.js";

describe("signInCodeEmail", () => {
  it("puts the code in the subject and both parts, right to left", () => {
    const email = signInCodeEmail({ name: "רונית", code: "042917" });
    expect(email.subject).toBe("קוד הכניסה שלך: 042917");
    expect(email.text).toContain("042917");
    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain(">042917<");
  });

  it("escapes the name in the HTML", () => {
    expect(signInCodeEmail({ name: "<b>x</b>", code: "1" }).html).toContain("שלום &lt;b&gt;x&lt;/b&gt;,");
  });
});

describe("inviteEmail", () => {
  it("links to the dashboard and names the Google account to use", () => {
    const email = inviteEmail({ name: "שירה", email: "shira@gmail.com", dashboardUrl: "https://app.example.com/" });
    expect(email.text).toContain("https://app.example.com\n");
    expect(email.text).toContain("shira@gmail.com");
    expect(email.html).toContain('href="https://app.example.com"');
  });
});
