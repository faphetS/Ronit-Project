import { describe, expect, it } from "vitest";
import { overview } from "../../content/overview.he";
import type { Lead, LeadSource, LeadStatus } from "../../data/types";
import { todaysLeadLines } from "./overview-model";

const lead = (source: LeadSource, status: LeadStatus) => ({ source, status }) as Lead;

describe("todaysLeadLines", () => {
  it("says so on a day without leads, and nothing more", () => {
    expect(todaysLeadLines([], overview)).toEqual({ title: "עוד אין לידים היום", sources: null, waiting: null });
  });

  it("counts the day's leads by source, most first, and the ones still new", () => {
    const leads = [lead("instagram", "talking"), lead("facebook", "new"), lead("facebook", "new"), lead("facebook", "not-relevant")];
    expect(todaysLeadLines(leads, overview)).toEqual({
      title: "4 לידים היום",
      sources: "פייסבוק 3 · אינסטגרם 1",
      waiting: "2 מחכים לטיפול",
    });
  });

  it("says everyone is being handled when none is still new", () => {
    expect(todaysLeadLines([lead("landing-page", "talking")], overview).waiting).toBe("כולם כבר בטיפול");
  });
});
