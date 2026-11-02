import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180, strictPort: true },
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
