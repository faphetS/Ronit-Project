import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGql = vi.hoisted(() => vi.fn());

vi.mock("./monday.client.js", () => ({
  gql: mockGql,
}));

vi.mock("../../config/db.js", () => ({
  getIgMessageMirror: vi.fn(() => null),
  setIgMessageMirror: vi.fn(),
}));

import {
  phoneVariants,
  findLeadByPhone,
  findLeadByPhoneAllBoards,
  matchLeadInItems,
} from "./monday.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("phoneVariants — unusable input", () => {
  // Regression: Salestrail sends "-" for WhatsApp calls with no caller id.
  // This used to reduce to [""], which Monday matched against every lead with
  // an empty phone column.
  it.each(["-", "", "   ", "n/a", "+", "12345"])("yields no variants for %j", (raw) => {
    expect(phoneVariants(raw)).toEqual([]);
  });

  it("still expands real Israeli numbers both ways", () => {
    expect(phoneVariants("0501234567")).toEqual(
      expect.arrayContaining(["0501234567", "972501234567"]),
    );
    expect(phoneVariants("+972501234567")).toEqual(
      expect.arrayContaining(["972501234567", "0501234567"]),
    );
  });

  it("accepts a 9-digit Israeli landline", () => {
    expect(phoneVariants("03-7273199")).toEqual(["037273199"]);
  });
});

describe("findLeadByPhone — unusable input", () => {
  it("returns null without querying Monday", async () => {
    await expect(findLeadByPhone("-")).resolves.toBeNull();
    expect(mockGql).not.toHaveBeenCalled();
  });

  it("queries Monday for a real number", async () => {
    mockGql.mockResolvedValue({
      items_page_by_column_values: { items: [{ id: "1", name: "Lead" }] },
    });

    await expect(findLeadByPhone("0501234567")).resolves.toEqual({
      itemId: "1",
      name: "Lead",
    });
    expect(mockGql).toHaveBeenCalled();
  });
});

describe("findLeadByPhoneAllBoards — unusable input", () => {
  it("returns null without querying Monday", async () => {
    await expect(findLeadByPhoneAllBoards("-")).resolves.toBeNull();
    expect(mockGql).not.toHaveBeenCalled();
  });
});

describe("matchLeadInItems — unusable input", () => {
  it("does not match a row whose phone column holds no digits", () => {
    const items = [
      { id: "row-with-dash", name: "Dash", columnValues: [{ text: "-", type: "phone" }] },
      { id: "row-with-blank", name: "Blank", columnValues: [{ text: " ", type: "phone" }] },
    ];

    expect(matchLeadInItems(items, ["-"], null)).toBeNull();
  });

  it("still matches on a real number", () => {
    const items = [{ id: "row-1", name: "Real", columnValues: [{ text: "+972501234567", type: "phone" }] }];

    expect(matchLeadInItems(items, ["0501234567"], null)).toEqual({ itemId: "row-1" });
  });
});
