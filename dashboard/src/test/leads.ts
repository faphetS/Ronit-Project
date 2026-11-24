import type { Lead } from "../data/types";

/** A made-up lead for tests: the name and number are invented. */
export function testLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    name: "יעל פרץ",
    phone: "0540000001",
    source: "instagram",
    status: "talking",
    service: "uman",
    groupId: null,
    assigneeId: null,
    mondayBoard: "רונית  - CRM",
    mondayGroup: "לידים חדשים אורטל",
    mondayUrl: "https://example.monday.com/boards/1/pulses/1",
    createdAt: "2026-11-20T08:00:00.000Z",
    updatedAt: "2026-11-20T08:00:00.000Z",
    lastNote: "",
    archived: false,
    calls: 0,
    lastCallOn: null,
    inquiryOn: "2026-11-20",
    lastMessage: null,
    nextStep: null,
    history: [],
    mondayPending: false,
    ...overrides,
  };
}
