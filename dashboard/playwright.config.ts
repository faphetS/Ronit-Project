import { defineConfig } from "@playwright/test";

// The smoke tests run against a production build served by `vite preview`: no on-demand compiling,
// so the first page load is as fast as every other one.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5180", channel: "chrome", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: "npm run build && npm run preview", url: "http://localhost:5180", reuseExistingServer: true, timeout: 180_000 },
});
