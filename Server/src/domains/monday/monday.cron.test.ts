import { describe, it, expect } from "vitest";
import { diffGroups, type BoardGroup } from "./monday.cron.js";

describe("diffGroups", () => {
  it("returns empty diff when nothing changed", () => {
    const groups: BoardGroup[] = [
      { id: "a", title: "Group A" },
      { id: "b", title: "Group B" },
    ];
    expect(diffGroups(groups, groups)).toEqual({ added: [], removed: [], renamed: [] });
  });

  it("detects an added group", () => {
    const prev: BoardGroup[] = [{ id: "a", title: "Group A" }];
    const next: BoardGroup[] = [
      { id: "a", title: "Group A" },
      { id: "b", title: "Group B" },
    ];
    const diff = diffGroups(prev, next);
    expect(diff.added).toEqual([{ id: "b", title: "Group B" }]);
    expect(diff.removed).toEqual([]);
    expect(diff.renamed).toEqual([]);
  });

  it("detects a removed group", () => {
    const prev: BoardGroup[] = [
      { id: "a", title: "Group A" },
      { id: "b", title: "Group B" },
    ];
    const next: BoardGroup[] = [{ id: "a", title: "Group A" }];
    const diff = diffGroups(prev, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([{ id: "b", title: "Group B" }]);
    expect(diff.renamed).toEqual([]);
  });

  it("detects a renamed group (same id, different title)", () => {
    const prev: BoardGroup[] = [{ id: "a", title: "Old Name" }];
    const next: BoardGroup[] = [{ id: "a", title: "New Name" }];
    const diff = diffGroups(prev, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.renamed).toEqual([{ id: "a", from: "Old Name", to: "New Name" }]);
  });

  it("handles mixed add + remove + rename in one diff", () => {
    const prev: BoardGroup[] = [
      { id: "keep", title: "Keep Me" },
      { id: "rename", title: "Before" },
      { id: "gone", title: "Deleted" },
    ];
    const next: BoardGroup[] = [
      { id: "keep", title: "Keep Me" },
      { id: "rename", title: "After" },
      { id: "new", title: "Fresh" },
    ];
    const diff = diffGroups(prev, next);
    expect(diff.added).toEqual([{ id: "new", title: "Fresh" }]);
    expect(diff.removed).toEqual([{ id: "gone", title: "Deleted" }]);
    expect(diff.renamed).toEqual([{ id: "rename", from: "Before", to: "After" }]);
  });

  it("treats first run (empty prev) as all groups added", () => {
    const prev: BoardGroup[] = [];
    const next: BoardGroup[] = [
      { id: "a", title: "Group A" },
      { id: "b", title: "Group B" },
    ];
    const diff = diffGroups(prev, next);
    expect(diff.added).toEqual(next);
    expect(diff.removed).toEqual([]);
    expect(diff.renamed).toEqual([]);
  });
});
