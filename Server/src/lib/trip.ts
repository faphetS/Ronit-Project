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
 *
 * Niqqud / cantillation marks are stripped first, so a vocalised "כִּסְלֵו" still matches.
 */
export function detectTrip(text: string): Trip | null {
  const plain = stripNiqqud(text);
  if (isHanukkahMention(plain)) return "hanukkah";
  if (isKislevMention(plain)) return "kislev";
  return null;
}

const NIQQUD = /[\u0591-\u05C7]/g;

function stripNiqqud(text: string): string {
  return text.replace(NIQQUD, "");
}

// Whole-message shapes, tested against the Hebrew letters of a message only.
// ר"ח / ראש חודש may prefix כסלו; a stretched final letter (כסלוו, חנוכהה) is
// still the word.
const KISLEV_ONLY = /^(?:רח|ראשחודש)?כי?סלי?ו+$/;
const HANUKKAH_ONLY = /^חנוכה+$/;

/**
 * The story-CTA trigger ("רשמי לי כסלו"): a message that is ONLY a trip's name —
 * "כסלו", "כסליו 🙏", "חנוכה!!", "כסלו 050-1234567". Exact on purpose: "חנוכה שמח"
 * or "לא כסלו" must not fire; anything longer still goes through the classifier.
 */
export function detectTripTrigger(text: string): Trip | null {
  // Hebrew letters only: drops emoji, punctuation (incl. ״ ׳ "), whitespace,
  // digits (phone numbers) and Latin, leaving just the words themselves.
  const letters = stripNiqqud(text).replace(/[^\u05D0-\u05EA]/g, "");

  const candidate: Trip | null = KISLEV_ONLY.test(letters)
    ? "kislev"
    : HANUKKAH_ONLY.test(letters)
      ? "hanukkah"
      : null;
  if (candidate === null) return null;

  // The reply paths re-derive the trip with detectTrip, so the trigger must never
  // fire where the two disagree ("כסלו 6-10": detectTrip reads the dates as Hanukkah).
  return detectTrip(text) === candidate ? candidate : null;
}

/**
 * Every trip a message names, kislev first (the order the question lists them). The same
 * mention tests detectTrip runs, without its hanukkah-first short-circuit — which is what
 * makes detectTrip alone unsafe as a fast path for "כסלו או חנוכה".
 */
export function tripMentions(text: string): Trip[] {
  const plain = stripNiqqud(text);
  const mentioned: Trip[] = [];
  if (isKislevMention(plain)) mentioned.push("kislev");
  if (isHanukkahMention(plain)) mentioned.push("hanukkah");
  return mentioned;
}

// Hebrew letters are not \w, so \b never fires around them. A negation is a standalone token:
// no other Hebrew letter may touch it, or "לאומן" (to Uman), "מלא" and "בלילה" would all match.
const NEGATION_WORD = /(?<![\u05D0-\u05EA])(?:לא|אין|בלי)(?![\u05D0-\u05EA])/;

/** A standalone לא / אין / בלי anywhere in the message. */
export function hasNegationWord(text: string): boolean {
  return NEGATION_WORD.test(stripNiqqud(text));
}

// A date range with its month optionally glued on: "6-10", "6-10/12", "6–10.12", "06-10/12/26".
// Dates are day/month, so the number right after the separator is the month and has to be the
// trip's: "6-10/10" is 6-10 October, not Hanukkah. A range with no month keeps its meaning, and
// a number that opens the NEXT range ("6-10/11-15" lists two) is not a month.
// `range` must be global and capture that month as group 1.
function hasDateRange(text: string, range: RegExp, month: number): boolean {
  for (const match of text.matchAll(range)) {
    if (match[1] === undefined || Number(match[1]) === month) return true;
  }
  return false;
}

// Hanukkah trip: 6-10/12/26.
function isHanukkahMention(text: string): boolean {
  if (/חנוכה/.test(text)) return true;
  if (/דצמבר/.test(text)) return true;
  // "6-10" / "6-10/12" / "6–10.12" — date range (hyphen or en dash); a glued month must be 12.
  const range = /\b0?6\s*[-\u2013]\s*0?10\b(?:[/.](\d{1,2})\b(?!\s*[-\u2013]\s*\d{1,2}\b))?/g;
  if (hasDateRange(text, range, 12)) return true;
  // "06.12" / "06/12" — single (start) date, day.month.
  if (/\b0?6[./]\s?0?12\b/.test(text)) return true;
  return false;
}

// Kislev (Rosh Chodesh) trip: 11-15/11/26.
function isKislevMention(text: string): boolean {
  // כסלו, כסליו (the flyer's own spelling), כיסלו, כיסליו.
  if (/כי?סלי?ו/.test(text)) return true;
  if (/נובמבר/.test(text)) return true;
  // "11-15" / "11-15/11" / "11–15.11" — date range (hyphen or en dash); a glued month must be 11.
  const range = /\b0?11\s*[-\u2013]\s*0?15\b(?:[/.](\d{1,2})\b(?!\s*[-\u2013]\s*\d{1,2}\b))?/g;
  if (hasDateRange(text, range, 11)) return true;
  // "11.11" / "11/11" — single (start) date, day.month.
  if (/\b0?11[./]\s?0?11\b/.test(text)) return true;
  return false;
}
