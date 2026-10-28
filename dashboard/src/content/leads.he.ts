import type { LeadStatus } from "../data/types";

export const leadsCopy = {
  status: {
    new: "חדש",
    talking: "בשיחה",
    "details-sent": "נשלחו פרטים",
    registered: "הרשמה הושלמה",
    "not-relevant": "לא רלוונטי",
  } satisfies Record<LeadStatus, string>,
  statusChanged: (label: string) => `הסטטוס עודכן: ${label}`,
} as const;
