export const states = {
  loading: "טוען…",
  error: "משהו השתבש בטעינה.",
  retry: "לנסות שוב",
  /** A section the person's role doesn't open. */
  noAccessTitle: "אין לך גישה לכאן",
  noAccess: "התפקיד שלך לא כולל את החלק הזה. אפשר לבקש מהניהול לפתוח אותו.",
  /** A card on an open screen that the person's role doesn't include: shown with a lock, over the card's own reason. */
  lockedTitle: "נעול לתפקיד שלך",
} as const;
