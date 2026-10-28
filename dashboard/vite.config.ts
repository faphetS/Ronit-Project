import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin as PostcssPlugin } from "postcss";

// Every CSS size becomes rem, so the root font size in theme.css scales the whole UI at once. Hairlines (1px or less) stay px.
const pxToRem: PostcssPlugin = {
  postcssPlugin: "px-to-rem",
  Declaration(declaration) {
    const value = declaration.value.replace(/(?<![\w.])(-?\d*\.?\d+)px\b/g, (match, px: string) =>
      Math.abs(Number(px)) <= 1 ? match : `${Number(px) / 16}rem`,
    );
    if (value !== declaration.value) declaration.value = value;
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [pxToRem] } },
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
