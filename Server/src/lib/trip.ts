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
  // כסלו, כסליו (the flyer's own spelling), כיסלו, כיסליו.
  if (/כי?סלי?ו/.test(text)) return true;
  if (/נובמבר/.test(text)) return true;
  // "11-15" / "11-15/11" — date range, optional trailing "/11" month.
  if (/\b0?11\s*-\s*0?15\b(?:\s*\/\s*0?11\b)?/.test(text)) return true;
  // "11.11" / "11/11" — single (start) date, day.month.
  if (/\b0?11[./]\s?0?11\b/.test(text)) return true;
  return false;
}
