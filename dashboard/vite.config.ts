import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    // With VITE_API_URL empty, the dashboard calls /api on its own origin; this sends it to a
    // server running locally (VITE_API_PROXY overrides), so the sign-in cookie stays first-party.
    proxy: { "/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:3000", changeOrigin: true } },
  },
  preview: { port: 5180, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    env: { VITE_DEMO_TODAY: "2026-10-28", VITE_MOCK_LATENCY: "0,0" },
    // jsdom start-up is slow on Windows when many files run in parallel; give each test room.
    testTimeout: 20_000,
  },
});
