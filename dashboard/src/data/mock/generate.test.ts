import { describe, expect, it } from "vitest";
import { dayAt, daysBetween, weekStart } from "../../lib/clock";
import { EXPIRING_WITHIN_DAYS, isOpenLead } from "../rules";
import { TARGETS, createDatabase } from "./generate";

const day = dayAt("2026-10-28");
const db = createDatabase({ seed: 5787, today: day });

describe("createDatabase", () => {
  it("is identical for the same seed", () => {
    expect(createDatabase({ seed: 5787, today: day })).toEqual(db);
  });

  it("keeps the hand-written records from the design first", () => {
    expect(db.leads[0].name).toBe("יעל פרץ");
    expect(db.customers[0].firstName).toBe("שרה");
  });

  it("hits the lead totals from the design", () => {
    expect(db.leads).toHaveLength(TARGETS.totalLeads);
    const open = db.leads.filter(isOpenLead);
    expect(open).toHaveLength(24);
    expect(open.filter((l) => l.status === "new")).toHaveLength(6);
    expect(open.filter((l) => l.status === "talking")).toHaveLength(11);
    expect(open.filter((l) => l.status === "details-sent")).toHaveLength(4);
    expect(open.filter((l) => l.status === "registered")).toHaveLength(3);
  });

  it("creates 14 leads this week and none after the demo moment", () => {
    const start = weekStart(day);
    expect(db.leads.filter((l) => daysBetween(start, new Date(l.createdAt)) >= 0)).toHaveLength(14);
    const demoNow = dayAt("2026-10-28", "15:30").getTime();
    expect(db.leads.every((l) => new Date(l.createdAt).getTime() <= demoNow)).toBe(true);
  });

  it("hits the customer and passport totals", () => {
    expect(db.customers).toHaveLength(TARGETS.customers);
    expect(db.customers.filter((c) => c.passport === null)).toHaveLength(23);
    const expiring = db.customers.filter((c) => c.passport !== null && daysBetween(day, new Date(c.passport.expiryDate)) <= EXPIRING_WITHIN_DAYS);
    expect(expiring).toHaveLength(5);
  });

  it("fills every group to its registrations", () => {
    const members = (groupId: string) => db.customers.filter((c) => c.groupIds.includes(groupId));
    expect(members("g-poland-nov")).toHaveLength(32);
    expect(members("g-challah-jlm")).toHaveLength(46);
    expect(members("g-uman-tubav")).toHaveLength(12);
    expect(members("g-uman-rh")).toHaveLength(8);
    expect(members("g-poland-nov").filter((c) => c.passport !== null)).toHaveLength(29);
  });

  it("uses unique ids", () => {
    const ids = [...db.leads.map((l) => l.id), ...db.customers.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
