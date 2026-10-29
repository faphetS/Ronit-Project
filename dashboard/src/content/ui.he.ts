/** Copy for shared components (tables, toasts, confirmations). */
export const uiCopy = {
  cancel: "ביטול",
  close: "סגירה",
  /** The action on a toast after a reversible change. */
  undo: "ביטול",
  /** Read after a finished step, for screen readers. */
  stepDone: "הושלם",
  stage: (step: number, total: number, label: string) => `שלב ${step} מתוך ${total}: ${label}`,
  ofTotal: (total: string) => `מתוך ${total}`,
  /** The chips under a message that insert a name or another personal field. */
  personalFields: "שדות אישיים",
  insertField: (label: string) => `הוספת ${label}`,
  /** Under the business name in the WhatsApp preview. */
  businessAccount: "חשבון עסקי",
  /** Paging under a long list. */
  pager: {
    label: "דפי הרשימה",
    range: (from: string, to: string, total: string) => `${from}-${to} מתוך ${total}`,
    previous: "הקודמים",
    next: "הבאים",
  },
} as const;
