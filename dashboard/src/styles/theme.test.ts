import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/theme.css"), "utf8");

describe("theme tokens", () => {
  it.each([
    ["--color-ink", "#1c1a18"],
    ["--color-copy", "#36312d"],
    ["--color-mute", "#635b55"],
    ["--color-mute-2", "#4f4843"],
    ["--color-faint", "#7d756e"],
    ["--color-line", "#efe9e2"],
    ["--color-gold", "#e0ab57"],
    ["--color-status-new", "#d39c43"],
    ["--color-status-talking", "#b46c46"],
    ["--color-status-sent", "#8a7867"],
    ["--color-status-registered", "#5b8753"],
    ["--color-status-irrelevant", "#c2b9b0"],
    ["--color-status-warning", "#bd4b2e"],
    ["--radius-card", "30px"],
    ["--radius-card-phone", "26px"],
  ])("defines %s as %s", (token, value) => {
    expect(css).toContain(`${token}: ${value};`);
  });

  it("uses Rubik for all text", () => {
    expect(css).toContain('--font-sans: "Rubik Variable", system-ui, sans-serif;');
  });

  it("makes glass and frost solid when Reduce Transparency is on", () => {
    expect(css.match(/prefers-reduced-transparency: reduce/g)).toHaveLength(2);
  });
});
