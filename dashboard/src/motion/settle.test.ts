import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cascadeDelay, useFirstKeys } from "./cascade";
import { pageLabels } from "./page-motion";
import { slideFrom } from "./variants";

describe("cascadeDelay", () => {
  it("starts the first row at 0.08 s and each next one 0.036 s later", () => {
    expect([0, 1, 2].map(cascadeDelay)).toEqual([0.08, 0.116, 0.152]);
  });

  it("never starts a row later than 0.5 s, however long the list", () => {
    expect(cascadeDelay(11)).toBe(0.476);
    expect(cascadeDelay(12)).toBe(0.5);
    expect(cascadeDelay(400)).toBe(0.5);
  });
});

describe("useFirstKeys", () => {
  it("cascades only the rows a list showed when it first had rows", () => {
    const { result, rerender } = renderHook(({ keys }: { keys: string[] }) => useFirstKeys(keys), { initialProps: { keys: [] as string[] } });
    rerender({ keys: ["a", "b"] });
    rerender({ keys: ["a", "b", "c"] });
    expect(["a", "b", "c"].map(result.current)).toEqual([true, true, false]);
  });
});

describe("pageLabels", () => {
  it("builds up the first page, settles later ones once the reel lets them, and leaves passing pages still", () => {
    expect(pageLabels({ mode: "build", held: false })).toEqual({ initial: "initial", animate: "enter" });
    expect(pageLabels({ mode: "settle", held: true })).toEqual({ initial: "held", animate: "held" });
    expect(pageLabels({ mode: "settle", held: false })).toEqual({ initial: "held", animate: "settled" });
    expect(pageLabels({ mode: "still", held: false })).toEqual({ initial: false, animate: "settled" });
  });
});

describe("slideFrom", () => {
  it("brings the next month in from the left in Hebrew and from the right in English", () => {
    expect(slideFrom(1, true)).toBe(-16);
    expect(slideFrom(1, false)).toBe(16);
    expect(slideFrom(-1, true)).toBe(16);
    expect(slideFrom(0, true)).toBe(0);
  });
});
