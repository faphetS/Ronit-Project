import type { leadsCopy as he } from "./leads.he";
import type { Widen } from "./types";

export const leadsCopy: Widen<typeof he> = {
  status: {
    new: "New",
    talking: "In talks",
    "details-sent": "Details sent",
    registered: "Registered",
    "not-relevant": "Not relevant",
  },
  statusChanged: (label) => `Status updated: ${label}`,
};
