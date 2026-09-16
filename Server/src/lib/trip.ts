export type Trip = "kislev" | "hanukkah";

/**
 * Detect which of the two parallel uman trips a message refers to.
 *
 * Order matters: Hanukkah is checked FIRST. The Hanukkah trip (6-10/12) falls
 * within the Hebrew month "כסלו" and its flyer shows Kislev dates, so a bare
 * "כסלו" mention must never swallow a Hanukkah-trip message — Hanukkah's own
 * explicit signals (word or date form) always take precedence.
 *
 * Bare "כסלו" (including "ר"ח כסלו") means the Rosh Chodesh Kislev trip
 * (11-15/11) per the client's explicit instruction — it is NOT treated as
 * ambiguous with Hanukkah.
 *
 * Ordinals ("הראשון" / "השני") are never guessed at — they return null.
 */
export function detectTrip(text: string): Trip | null {
  if (isHanukkahMention(text)) return "hanukkah";
  if (isKislevMention(text)) return "kislev";
  return null;
}

// Hanukkah trip: 6-10/12/26.
function isHanukkahMention(text: string): boolean {
  if (/חנוכה/.test(text)) return true;
  if (/דצמבר/.test(text)) return true;
  // "6-10" / "6-10/12" — date range, optional trailing "/12" month.
  if (/\b0?6\s*-\s*0?10\b(?:\s*\/\s*0?12\b)?/.test(text)) return true;
  // "06.12" / "06/12" — single (start) date, day.month.
  if (/\b0?6[./]\s?0?12\b/.test(text)) return true;
  return false;
}

// Kislev (Rosh Chodesh) trip: 11-15/11/26.
function isKislevMention(text: string): boolean {
  if (/כסלו/.test(text)) return true;
  if (/נובמבר/.test(text)) return true;
  // "11-15" / "11-15/11" — date range, optional trailing "/11" month.
  if (/\b0?11\s*-\s*0?15\b(?:\s*\/\s*0?11\b)?/.test(text)) return true;
  // "11.11" / "11/11" — single (start) date, day.month.
  if (/\b0?11[./]\s?0?11\b/.test(text)) return true;
  return false;
}
