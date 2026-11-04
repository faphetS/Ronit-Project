export type IconShape = string | { cx: number; cy: number; r: number };

/** 24×24 stroke icons from the approved canvas. "forward" and "back" are drawn for RTL; Icon flips them in LTR. */
export const ICONS = {
  home: ["M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"],
  leads: [{ cx: 9, cy: 8, r: 3.5 }, "M3 20a6 6 0 0 1 12 0M18 8v6M15 11h6"],
  customers: [
    "M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z",
    { cx: 9, cy: 11, r: 2 },
    "M6 16a3 3 0 0 1 6 0M14 10h4M14 14h3",
  ],
  groups: [
    "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  ],
  greetings: ["M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"],
  cake: ["M4 20h16", "M5.5 20v-6.5A1.5 1.5 0 0 1 7 12h10a1.5 1.5 0 0 1 1.5 1.5V20", "M5.5 16c1.3 0 1.9-1 3.2-1s1.9 1 3.3 1 2-1 3.3-1 1.9 1 3.2 1", "M12 12V9", "M12 4.5c.9.8 1 1.8 0 2.6-1-.8-.9-1.8 0-2.6z"],
  chat: ["M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"],
  import: ["M12 3v12M7 10l5 5 5-5M5 21h14"],
  history: ["M20.5 12a8.5 8.5 0 1 1-2.5-6", "M20.5 4.5V9H16", "M12 8v4.5l3 1.5"],
  users: [{ cx: 9, cy: 8, r: 3.2 }, "M3.5 19a5.5 5.5 0 0 1 11 0", { cx: 17, cy: 9, r: 2.6 }, "M16 14.2a4.6 4.6 0 0 1 5 4.8"],
  settings: ["M4 7h9M17 7h3M4 17h3M11 17h9", { cx: 15, cy: 7, r: 2 }, { cx: 9, cy: 17, r: 2 }],
  search: [{ cx: 11, cy: 11, r: 6.5 }, "m16 16 4 4"],
  bell: ["M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z", "M10 20a2 2 0 0 0 4 0"],
  forward: ["M14 6l-6 6 6 6"],
  /** The chevron that pairs with "forward": earlier days, the month before. */
  earlier: ["M10 6l6 6-6 6"],
  back: ["M5 12h14M13 6l6 6-6 6"],
  calendar: ["M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z", "M3 10h18M8 3v4M16 3v4"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  plus: ["M12 5v14M5 12h14"],
  at: [{ cx: 12, cy: 12, r: 3.5 }, "M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"],
  key: [{ cx: 8, cy: 15, r: 4 }, "m11 12 8-8M16 7l2 2M14 9l2 2"],
  lock: ["M7.5 10.5h9a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18v-5a2.5 2.5 0 0 1 2.5-2.5z", "M8 10.5V8a4 4 0 0 1 8 0v2.5"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "m13.5 6.5 4 4"],
  phone: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"],
  shield: ["M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z", "m9 12 2 2 4-4"],
  signOut: ["M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h11"],
  close: ["M6 6l12 12M18 6 6 18"],
  chevronDown: ["m6 9 6 6 6-6"],
  filter: ["M4 6h16M7 12h10M10 18h4"],
  eye: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z", { cx: 12, cy: 12, r: 3 }],
  minus: ["M7 12h10"],
  alert: [{ cx: 12, cy: 12, r: 8.5 }, "M12 7.5v5.5M12 16.2v.3"],
  user: [{ cx: 12, cy: 8, r: 3.75 }, "M4.5 20a7.5 7.5 0 0 1 15 0"],
  globe: [{ cx: 12, cy: 12, r: 8.5 }, "M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z"],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof ICONS;
