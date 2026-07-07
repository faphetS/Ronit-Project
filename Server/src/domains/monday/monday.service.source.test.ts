import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted to the top of the file, so the factory must not reference
// variables declared below it. Use vi.hoisted to create the spy in the hoisted
// zone so it is available inside the factory.
const mockGql = vi.hoisted(() => vi.fn());
const mockGetIgMessageMirror = vi.hoisted(() => vi.fn());
const mockSetIgMessageMirror = vi.hoisted(() => vi.fn());

vi.mock("./monday.client.js", () => ({
  gql: mockGql,
}));

vi.mock("../../config/db.js", () => ({
  getIgMessageMirror: mockGetIgMessageMirror,
  setIgMessageMirror: mockSetIgMessageMirror,
}));

import { createLeadRow, updateLeadRow, updateLastIgMessage } from "./monday.service.js";
import { env } from "../../config/env.js";

beforeEach(() => {
  vi.clearAllMocks();
  // createLeadRow reads the return value to get the item id.
  mockGql.mockResolvedValue({ create_item: { id: "test-item-42" } });
  mockGetIgMessageMirror.mockReturnValue(null);
});

describe("createLeadRow — Lead Source column", () => {
  it("includes MONDAY_COL_SOURCE_ID set to the organic label in column_values", async () => {
    await createLeadRow({
      name: "Test Lead",
      phone: "0501234567",
      service: "uman",
      source: "instagram",
    });

    expect(mockGql).toHaveBeenCalledOnce();
    const [, variables] = mockGql.mock.calls[0] as [unknown, Record<string, unknown>];
    const columnValues = JSON.parse(variables.columnValues as string) as Record<string, unknown>;

    expect(columnValues[env.MONDAY_COL_SOURCE_ID]).toEqual({
      label: env.MONDAY_SOURCE_LABEL_ORGANIC,
    });
  });

  it("sets the organic label regardless of input.source value", async () => {
    for (const source of ["instagram", "whatsapp", "website"] as const) {
      vi.clearAllMocks();
      mockGql.mockResolvedValue({ create_item: { id: "item-x" } });

      await createLeadRow({ name: "N", phone: null, service: null, source });

      const [, variables] = mockGql.mock.calls[0] as [unknown, Record<string, unknown>];
      const columnValues = JSON.parse(variables.columnValues as string) as Record<string, unknown>;
      expect(columnValues[env.MONDAY_COL_SOURCE_ID]).toEqual({
        label: env.MONDAY_SOURCE_LABEL_ORGANIC,
      });
    }
  });

  it("passes create_labels_if_missing: true in the mutation", async () => {
    await createLeadRow({
      name: "Safety Lead",
      phone: null,
      service: null,
      source: "website",
    });

    const [mutation] = mockGql.mock.calls[0] as [string, unknown];
    expect(mutation).toContain("create_labels_if_missing: true");
  });
});

describe("createLeadRow — sourceLabel + inquiryDate overrides (n8n fallback)", () => {
  it("sourceLabel override → writes the paid label instead of organic", async () => {
    await createLeadRow({
      name: "FB Lead",
      phone: "972523730451",
      service: "uman",
      source: "n8n",
      sourceLabel: env.MONDAY_SOURCE_LABEL_PAID,
    });

    const [, variables] = mockGql.mock.calls[0] as [unknown, Record<string, unknown>];
    const columnValues = JSON.parse(variables.columnValues as string) as Record<string, unknown>;
    expect(columnValues[env.MONDAY_COL_SOURCE_ID]).toEqual({
      label: env.MONDAY_SOURCE_LABEL_PAID,
    });
  });

  it("inquiryDate override → writes the original lead date, not today", async () => {
    await createLeadRow({
      name: "FB Lead",
      phone: "972523730451",
      service: "uman",
      source: "n8n",
      inquiryDate: "2026-01-15",
    });

    const [, variables] = mockGql.mock.calls[0] as [unknown, Record<string, unknown>];
    const columnValues = JSON.parse(variables.columnValues as string) as Record<string, unknown>;
    expect(columnValues[env.MONDAY_COL_INQUIRY_DATE_ID]).toEqual({ date: "2026-01-15" });
  });

  it("neither passed → unchanged defaults: today's date + organic label", async () => {
    await createLeadRow({
      name: "Organic Lead",
      phone: null,
      service: null,
      source: "instagram",
    });

    const [, variables] = mockGql.mock.calls[0] as [unknown, Record<string, unknown>];
    const columnValues = JSON.parse(variables.columnValues as string) as Record<string, unknown>;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    expect(columnValues[env.MONDAY_COL_INQUIRY_DATE_ID]).toEqual({ date: today });
    expect(columnValues[env.MONDAY_COL_SOURCE_ID]).toEqual({
      label: env.MONDAY_SOURCE_LABEL_ORGANIC,
    });
  });
});

describe("updateLeadRow — Lead Source column", () => {
  it("does NOT include MONDAY_COL_SOURCE_ID in column_values", async () => {
    mockGql.mockResolvedValue({ change_multiple_column_values: { id: "item-99" } });

    await updateLeadRow("board-1", "item-99", { phone: "0509999999" });

    for (const call of mockGql.mock.calls) {
      const [mutation, variables] = call as [string, Record<string, unknown>];
      if (variables.columnValues) {
        const columnValues = JSON.parse(variables.columnValues as string) as Record<string, unknown>;
        expect(columnValues).not.toHaveProperty(env.MONDAY_COL_SOURCE_ID);
      }
      // Belt-and-suspenders: updateLeadRow must never invoke create_item.
      expect(mutation).not.toContain("create_item");
    }
  });
});

describe("createLeadRow — seeds the IG message mirror", () => {
  it("seeds an empty mirror for the new item so the first updateLastIgMessage skips its read", async () => {
    await createLeadRow({ name: "N", phone: null, service: null, source: "instagram" });

    expect(mockSetIgMessageMirror).toHaveBeenCalledWith("test-item-42", "");
  });
});

describe("updateLastIgMessage — mirror-first read skip", () => {
  it("mirror hit → exactly 1 gql call (the mutation), correct הודעה numbering, mirror re-seeded", async () => {
    mockGetIgMessageMirror.mockReturnValue("הודעה 1: hello");
    mockGql.mockResolvedValue({ change_multiple_column_values: { id: "item-1" } });

    await updateLastIgMessage("item-1", "second message");

    expect(mockGql).toHaveBeenCalledOnce();
    const [, variables] = mockGql.mock.calls[0] as [unknown, Record<string, unknown>];
    const columnValues = JSON.parse(variables.columnValues as string) as Record<string, unknown>;
    const text = (columnValues[env.MONDAY_COL_LAST_IG_MESSAGE_ID] as { text: string }).text;

    expect(text).toBe("הודעה 1: second message\nהודעה 2: hello");
    expect(mockSetIgMessageMirror).toHaveBeenCalledWith("item-1", text);
  });

  it("mirror miss → falls back to a read-then-write (2 gql calls), mirror seeded after", async () => {
    mockGetIgMessageMirror.mockReturnValue(null);
    mockGql
      .mockResolvedValueOnce({ items: [{ column_values: [{ id: "x", text: "הודעה 1: old" }] }] })
      .mockResolvedValueOnce({ change_multiple_column_values: { id: "item-2" } });

    await updateLastIgMessage("item-2", "new message");

    expect(mockGql).toHaveBeenCalledTimes(2);
    const [, variables] = mockGql.mock.calls[1] as [unknown, Record<string, unknown>];
    const columnValues = JSON.parse(variables.columnValues as string) as Record<string, unknown>;
    const text = (columnValues[env.MONDAY_COL_LAST_IG_MESSAGE_ID] as { text: string }).text;

    expect(text).toBe("הודעה 1: new message\nהודעה 2: old");
    expect(mockSetIgMessageMirror).toHaveBeenCalledWith("item-2", text);
  });

  it("write failure → mirror is left untouched", async () => {
    mockGetIgMessageMirror.mockReturnValue("");
    mockGql.mockRejectedValue(new Error("Monday down"));

    await expect(updateLastIgMessage("item-3", "message")).rejects.toThrow("Monday down");

    expect(mockSetIgMessageMirror).not.toHaveBeenCalled();
  });
});
