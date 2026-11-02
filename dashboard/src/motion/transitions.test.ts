import { describe, expect, it } from "vitest";
import { springs } from "./springs";
import { resolveScreenTransition } from "./transitions";

const isPushed = (pathname: string) => /^\/(leads|customers)\/[^/]+$/.test(pathname) || pathname === "/users" || pathname === "/import";

describe("resolveScreenTransition", () => {
  it("fades between tabs", () => {
    expect(resolveScreenTransition({ from: "/", to: "/leads", navigationType: "PUSH", backHint: false, isPushed })).toEqual({ kind: "fade", direction: "forward" });
  });

  it("pushes forward into a detail screen", () => {
    expect(resolveScreenTransition({ from: "/customers", to: "/customers/c1", navigationType: "PUSH", backHint: false, isPushed })).toEqual({ kind: "push", direction: "forward" });
  });

  it("pops back with browser back", () => {
    expect(resolveScreenTransition({ from: "/customers/c1", to: "/customers", navigationType: "POP", backHint: false, isPushed })).toEqual({ kind: "push", direction: "back" });
  });

  it("pops back when a back button replaced the entry", () => {
    expect(resolveScreenTransition({ from: "/import", to: "/users", navigationType: "REPLACE", backHint: true, isPushed })).toEqual({ kind: "push", direction: "back" });
  });

  it("does not push on the first screen", () => {
    expect(resolveScreenTransition({ from: null, to: "/customers/c1", navigationType: "POP", backHint: false, isPushed }).kind).toBe("fade");
  });
});

describe("springs", () => {
  it("are all physical springs", () => {
    for (const spring of Object.values(springs)) expect(spring.type).toBe("spring");
  });
});
