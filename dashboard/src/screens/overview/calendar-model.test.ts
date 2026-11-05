import { describe, expect, it } from "vitest";
import { holidayNames } from "../../content/holidays.he";
import { overview } from "../../content/overview.he";
import type { GroupParticipant, GroupSummary } from "../../data/types";
import { bookingItems, comingUp, eventGroupsToRead, flightItems, holidayItems, itemsByDay, kindsOf } from "./calendar-model";

const copy = overview.calendar;

function group(id: string, type: GroupSummary["type"], startsOn: string | null, endsOn: string | null): GroupSummary {
  return { id, name: id, shortName: `קצר ${id}`, type, startsOn, endsOn } as GroupSummary;
}

function booking(id: string, eventOn: string | null, note: string | null): GroupParticipant {
  return { id, customerId: `c-${id}`, firstName: "שרה", lastName: "כהן", eventOn, note } as GroupParticipant;
}

describe("eventGroupsToRead", () => {
  const groups = [
    group("oct", "event", "2026-10-01", "2026-10-31"),
    group("nov", "event", "2026-11-01", "2026-11-30"),
    group("jun", "event", "2027-06-01", "2027-06-30"),
    group("flight", "flight", "2026-12-06", "2026-12-10"),
    group("undated", "event", null, null),
  ];

  it("reads the shown month's challah group and every one not over yet", () => {
    expect(eventGroupsToRead(groups, "2026-11", "2026-11-05")).toEqual(["nov", "jun"]);
    expect(eventGroupsToRead(groups, "2026-10", "2026-11-05")).toEqual(["oct", "nov", "jun"]);
  });
});

describe("calendar items", () => {
  it("shows each dated booking with what, where and who, opening the customer", () => {
    const items = bookingItems([booking("1", "2027-02-14", "ערב נשים · רמת גן"), booking("2", null, "אילת"), booking("3", "2027-02-16", null)], copy);
    expect(items).toEqual([
      { key: "event-1", day: "2027-02-14", kind: "event", title: "ערב נשים · רמת גן", detail: "שרה כהן", to: "/customers/c-1" },
      { key: "event-3", day: "2027-02-16", kind: "event", title: "אירוע חלה", detail: "שרה כהן", to: "/customers/c-3" },
    ]);
  });

  it("shows a dated flight leaving and coming back", () => {
    const items = flightItems([group("g", "flight", "2026-12-06", "2026-12-10"), group("tbd", "flight", null, null)], copy);
    expect(items.map((item) => [item.day, item.detail, item.to])).toEqual([
      ["2026-12-06", "יציאה לטיסה", "/groups/g"],
      ["2026-12-10", "חזרה מהטיסה", "/groups/g"],
    ]);
  });

  it("finds the holidays on their first day, with the Hebrew date", () => {
    const items = holidayItems("2026-11-01", "2026-12-31", holidayNames, "he");
    expect(items.map((item) => [item.day, item.title])).toEqual([["2026-12-05", "חנוכה"]]);
    expect(items[0].detail).toContain("כסלו");
  });

  it("lists what's coming up from today, holidays first on a shared day", () => {
    const items = [
      ...holidayItems("2026-12-01", "2026-12-31", holidayNames, "he"),
      ...bookingItems([booking("past", "2026-11-01", "עבר"), booking("a", "2026-12-05", "חיפה"), booking("b", "2026-11-20", "חולון")], copy),
    ];
    expect(comingUp(items, "2026-11-05", 2).map((item) => item.title)).toEqual(["חולון", "חנוכה"]);
    const byDay = itemsByDay(items);
    expect(kindsOf(byDay.get("2026-12-05") ?? [])).toEqual(["holiday", "event"]);
  });
});
