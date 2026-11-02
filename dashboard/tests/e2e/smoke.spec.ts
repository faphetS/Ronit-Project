import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("כתובת אימייל").fill("ronit@example.com");
  await page.getByLabel("סיסמה").fill("demo");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /שלום, רונית/ })).toBeVisible();
}

test("signs in and shows this week's leads", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("region", { name: "לידים השבוע" })).toContainText("14");
});

test("desktop: the menu pill follows the chosen section", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop shell only");
  await signIn(page);
  const menu = page.getByRole("navigation", { name: "ניווט ראשי" });
  await menu.getByRole("link", { name: /^לידים/ }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(menu.getByRole("link", { name: /^לידים/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: /לידים/ })).toBeVisible();
});

test("phone: tabs switch screens and a pushed screen goes back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone shell only");
  await signIn(page);
  await page.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "לקוחות" }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await page.goto("/customers/c-sara-cohen");
  await expect(page.getByRole("heading", { level: 1, name: "כרטיס לקוח" })).toBeVisible();
  await page.getByRole("button", { name: "חזרה" }).click();
  await expect(page).toHaveURL(/\/customers$/);
});

test("works with Reduce Motion on", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await expect(page.getByRole("region", { name: "לידים השבוע" })).toBeVisible();
});

test("captures sign-in and overview for visual review", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("כתובת אימייל").waitFor();
  await page.waitForTimeout(1000); // let the springs settle before the screenshot
  await page.screenshot({ path: testInfo.outputPath("sign-in.png") });
  await signIn(page);
  await expect(page.getByRole("region", { name: "לידים השבוע" })).toContainText("14");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath("overview.png") });
});
