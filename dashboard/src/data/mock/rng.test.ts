import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("stays inside integer bounds", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(3, 5);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  it("refuses to pick from an empty list", () => {
    expect(() => createRng(1).pick([])).toThrow("empty");
  });
});
