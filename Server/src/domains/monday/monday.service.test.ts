import { describe, it, expect, vi } from "vitest";

// monday.client.ts makes fetch calls; mock it so importing monday.service.ts
// doesn't attempt real network I/O during tests.
vi.mock("./monday.client.js", () => ({
  gql: vi.fn(),
}));

import { matchLeadInItems, type BoardLeadItem } from "./monday.service.js";

function makeItem(
  id: string,
  name: string,
  phoneText: string | null = null,
): BoardLeadItem {
  const columnValues: BoardLeadItem["columnValues"] = [];
  if (phoneText !== null) {
    columnValues.push({ text: phoneText, type: "phone" });
  }
  return { id, name, columnValues };
}

describe("matchLeadInItems", () => {
  it("matches by phone variant normalization — stored with formatting vs plain digits", () => {
    const items = [makeItem("item-1", "Some Lead", "+972 50-727-4478")];
    const result = matchLeadInItems(items, ["0507274478"], null);
    expect(result).toEqual({ itemId: "item-1" });
  });

  it("matches 972-prefix stored phone against 0-prefix input", () => {
    const items = [makeItem("item-2", "Lead Two", "972501234567")];
    const result = matchLeadInItems(items, ["0501234567"], null);
    expect(result).toEqual({ itemId: "item-2" });
  });

  it("matches 0-prefix stored phone against 972-prefix input", () => {
    const items = [makeItem("item-3", "Lead Three", "0501234567")];
    const result = matchLeadInItems(items, ["972501234567"], null);
    expect(result).toEqual({ itemId: "item-3" });
  });

  it("matches by name case-insensitively", () => {
    const items = [makeItem("item-4", "Moshe Cohen")];
    const result = matchLeadInItems(items, [], "MOSHE COHEN");
    expect(result).toEqual({ itemId: "item-4" });
  });

  it("returns null when no phone or name matches", () => {
    const items = [makeItem("item-5", "Other Lead", "0509999999")];
    const result = matchLeadInItems(items, ["0501111111"], "Unrelated Name");
    expect(result).toBeNull();
  });

  it("returns null on empty phones and null name", () => {
    const items = [makeItem("item-6", "Somebody", "0501234567")];
    const result = matchLeadInItems(items, [], null);
    expect(result).toBeNull();
  });

  it("returns null on empty items array", () => {
    const result = matchLeadInItems([], ["0501234567"], "Test");
    expect(result).toBeNull();
  });

  it("returns first match when multiple items could match", () => {
    const items = [
      makeItem("item-7", "Lead Alpha", "0501234567"),
      makeItem("item-8", "Lead Beta", "0501234567"),
    ];
    const result = matchLeadInItems(items, ["0501234567"], null);
    expect(result).toEqual({ itemId: "item-7" });
  });

  it("ignores non-phone column types for phone matching", () => {
    const item: BoardLeadItem = {
      id: "item-9",
      name: "Text Lead",
      columnValues: [{ text: "0501234567", type: "text" }],
    };
    const result = matchLeadInItems([item], ["0501234567"], null);
    expect(result).toBeNull();
  });
});
