import type { uiCopy as he } from "./ui.he";
import type { Widen } from "./types";

export const uiCopy: Widen<typeof he> = {
  cancel: "Cancel",
  close: "Close",
  undo: "Undo",
  stepDone: "done",
  stage: (step, total, label) => `Step ${step} of ${total}: ${label}`,
  ofTotal: (total) => `out of ${total}`,
  personalFields: "Personal fields",
  insertField: (label) => `Insert ${label}`,
  businessAccount: "Business account",
  pager: {
    label: "List pages",
    range: (from, to, total) => `${from}-${to} of ${total}`,
    previous: "Previous",
    next: "Next",
  },
};
