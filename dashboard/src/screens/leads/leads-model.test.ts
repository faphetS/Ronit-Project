import { describe, expect, it } from "vitest";
import { ApiError } from "../../data/http/client";
import { NotFoundError } from "../../data/services";
import type { GroupSummary } from "../../data/types";
import { testLead } from "../../test/leads";
import { boardLeads, columnOf, moveFor, STATUS_CHOICES, statusChangeProblem, statusForDrop, tripsAhead } from "./leads-model";

describe("tripsAhead", () => {
  const trip = (id: string, type: GroupSummary["type"], startsOn: string | null, endsOn: string | null = startsOn) =>
    ({ id, type, startsOn, endsOn }) as GroupSummary;
  const ids = (groups: GroupSummary[]) => tripsAhead(groups, "2026-11-26").map((entry) => entry.group.id);

  it("lists flights and events from today on, soonest first, without projects, past trips or trips without a date", () => {
    const groups = [
      trip("left", "flight", "2026-11-01", "2026-11-05"),
      trip("later", "flight", "2027-01-10"),
      trip("event", "event", "2026-11-27"),
      trip("project", "project", "2026-11-28"),
      trip("soon", "flight", "2026-12-06"),
      trip("undated", "flight", null),
      trip("today", "flight", "2026-11-26"),
    ];
    expect(ids(groups)).toEqual(["today", "event", "soon", "later"]);
  });

  it("puts a flight that left and isn't back yet first, and skips an event that already began", () => {
    const groups = [trip("next", "flight", "2026-12-06"), trip("away", "flight", "2026-11-24", "2026-11-28"), trip("month", "event", "2026-11-01", "2026-11-30")];
    expect(tripsAhead(groups, "2026-11-26")).toEqual([
      { group: groups[1], underWay: true },
      { group: groups[0], underWay: false },
    ]);
  });
});

describe("the board's columns", () => {
  it("puts each status in its column, with details sent beside in talks", () => {
    expect(columnOf("new")).toBe("new");
    expect(columnOf("talking")).toBe("working");
    expect(columnOf("details-sent")).toBe("working");
    expect(columnOf("no-answer")).toBe("no-answer");
    expect(columnOf("registered")).toBe("registered");
    expect(columnOf("not-relevant")).toBe("not-relevant");
  });

  it("offers the five columns in board order, each with the status it gives", () => {
    expect(STATUS_CHOICES).toEqual([
      { target: "new", status: "new" },
      { target: "working", status: "talking" },
      { target: "no-answer", status: "no-answer" },
      { target: "registered", status: "registered" },
      { target: "not-relevant", status: "not-relevant" },
    ]);
  });

  it("gives a dropped lead its new column's status, and nothing in its own column", () => {
    expect(statusForDrop({ status: "new" }, "working")).toBe("talking");
    expect(statusForDrop({ status: "details-sent" }, "working")).toBeNull();
    expect(statusForDrop({ status: "talking" }, "not-relevant")).toBe("not-relevant");
    expect(statusForDrop({ status: "not-relevant" }, "new")).toBe("new");
    expect(statusForDrop({ status: "registered" }, "registered")).toBeNull();
  });

  it("lays the open and not-relevant lists out once each, by status", () => {
    const working = testLead({ id: "a", status: "talking" });
    const closed = testLead({ id: "b", status: "not-relevant" });
    // Moved to not relevant a moment ago: still in the open list until it refreshes.
    const justClosed = testLead({ id: "c", status: "not-relevant" });
    const board = boardLeads([working, justClosed], [closed, justClosed]);
    expect(board.working.map((lead) => lead.id)).toEqual(["a"]);
    expect(board["not-relevant"].map((lead) => lead.id)).toEqual(["c", "b"]);
    expect(board.new).toEqual([]);
  });

  it("turns a drop into a move, or nothing", () => {
    const lead = testLead({ id: "a", status: "new" });
    const board = boardLeads([lead], []);
    expect(moveFor(board, "a", "no-answer")).toEqual({ lead, status: "no-answer" });
    expect(moveFor(board, "a", "new")).toBeNull();
    expect(moveFor(board, "a", null)).toBeNull();
    expect(moveFor(board, "a", "somewhere-else")).toBeNull();
    expect(moveFor(board, "missing", "no-answer")).toBeNull();
  });

  it("says why a status change didn't go through", () => {
    expect(statusChangeProblem(new NotFoundError("Lead", "a"))).toBe("gone");
    expect(statusChangeProblem(new ApiError(403, "NO_ACCESS", "no"))).toBe("no-access");
    expect(statusChangeProblem(new Error("offline"))).toBe("failed");
  });
});
