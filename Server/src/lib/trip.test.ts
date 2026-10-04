import { describe, it, expect } from "vitest";
import { detectTrip, detectTripTrigger, type Trip } from "./trip.js";

// כסלו / חנוכה written with niqqud, spelled out as code points so an editor can't
// normalise the combining marks away. The self-check below guards the same thing.
const VOCALISED_KISLEV = "\u05DB\u05BC\u05B4\u05E1\u05B0\u05DC\u05B5\u05D5"; // כִּסְלֵו
const VOCALISED_HANUKKAH = "\u05D7\u05B2\u05E0\u05D5\u05BC\u05DB\u05BC\u05B8\u05D4"; // חֲנוּכָּה

describe("test fixtures", () => {
  it("really contain niqqud", () => {
    expect(/[\u0591-\u05C7]/.test(VOCALISED_KISLEV)).toBe(true);
    expect(/[\u0591-\u05C7]/.test(VOCALISED_HANUKKAH)).toBe(true);
  });
});

describe("detectTrip — hanukkah", () => {
  it("matches the word חנוכה", () => {
    expect(detectTrip("מעוניינת בנסיעת חנוכה")).toBe("hanukkah");
  });
  it("matches a vocalised חנוכה (niqqud stripped first)", () => {
    expect(detectTrip(VOCALISED_HANUKKAH)).toBe("hanukkah");
  });
  it("matches דצמבר", () => {
    expect(detectTrip("אני פנויה בדצמבר")).toBe("hanukkah");
  });
  it("matches the bare date range 6-10", () => {
    expect(detectTrip("6-10 מתאים לי")).toBe("hanukkah");
  });
  it("matches the date range with month 6-10/12", () => {
    expect(detectTrip("הנסיעה של 6-10/12")).toBe("hanukkah");
  });
  it("matches the single date form 06.12", () => {
    expect(detectTrip("יוצאים ב-06.12")).toBe("hanukkah");
  });
  it("matches the single date form with slash 06/12", () => {
    expect(detectTrip("יוצאים ב-06/12")).toBe("hanukkah");
  });
});

describe("detectTrip — kislev (Rosh Chodesh)", () => {
  it("matches bare כסלו — client ruled this means the Rosh Chodesh trip", () => {
    expect(detectTrip("מעוניינת בכסלו")).toBe("kislev");
  });
  it('matches ר"ח כסלו', () => {
    expect(detectTrip('הנסיעה של ר"ח כסלו מתאימה לי')).toBe("kislev");
  });
  it("matches the flyer's own spelling כסליו (extra yod)", () => {
    expect(detectTrip("מעוניינת בכסליו")).toBe("kislev");
  });
  it("matches the full spelling כיסלו (yod after the kaf)", () => {
    expect(detectTrip("מעוניינת בכיסלו")).toBe("kislev");
  });
  it("matches the full spelling with both yods, כיסליו", () => {
    expect(detectTrip("מעוניינת בכיסליו")).toBe("kislev");
  });
  it("matches a vocalised כסלו (niqqud stripped first)", () => {
    expect(detectTrip(VOCALISED_KISLEV)).toBe("kislev");
  });
  it("matches נובמבר", () => {
    expect(detectTrip("אני פנויה בנובמבר")).toBe("kislev");
  });
  it("matches the bare date range 11-15", () => {
    expect(detectTrip("11-15 מתאים לי")).toBe("kislev");
  });
  it("matches the date range with month 11-15/11", () => {
    expect(detectTrip("הנסיעה של 11-15/11")).toBe("kislev");
  });
  it("matches the single date form 11.11", () => {
    expect(detectTrip("יוצאים ב-11.11")).toBe("kislev");
  });
});

describe("detectTrip — hanukkah wins over כסלו", () => {
  it("a message with BOTH the hanukkah date form and the word כסלו resolves to hanukkah", () => {
    expect(detectTrip("הנסיעה של 6-10/12, זה גם בכסלו נכון?")).toBe("hanukkah");
  });
  it("a message with the word חנוכה AND the word כסלו resolves to hanukkah", () => {
    expect(detectTrip("נסיעת חנוכה שיוצאת בכסלו")).toBe("hanukkah");
  });
});

describe("detectTrip — no guessing", () => {
  it('returns null for an ordinal "הראשון" (the first)', () => {
    expect(detectTrip("אני רוצה את הנסיעה הראשונה")).toBeNull();
  });
  it('returns null for an ordinal "השני" (the second)', () => {
    expect(detectTrip("מעוניינת בתאריך השני")).toBeNull();
  });
  it("returns null for plain interested text with no date/month signal", () => {
    expect(detectTrip("אני מעוניינת מאוד")).toBeNull();
  });
  it("returns null for an unrelated phone-number-like digit string", () => {
    expect(detectTrip("תתקשרי אליי ל-0501234567")).toBeNull();
  });
  it("returns null for empty text", () => {
    expect(detectTrip("")).toBeNull();
  });
});

// The story-CTA trigger: "רשמי לי כסלו" → women reply with JUST the trip word.
const TRIGGER_POSITIVES: Array<[string, Trip]> = [
  ["כסלו", "kislev"],
  ["כסליו", "kislev"],
  ["כיסלו", "kislev"],
  ["כסלוו", "kislev"],
  ["כסלו🙏🏻", "kislev"],
  ["כסלו ❤️", "kislev"],
  [" כסלו!! ", "kislev"],
  [VOCALISED_KISLEV, "kislev"],
  ['ר"ח כסלו', "kislev"],
  ["כסלו 050-523-0019", "kislev"],
  ["חנוכה", "hanukkah"],
  ["חנוכה🕎", "hanukkah"],
  ["חנוכהה", "hanukkah"],
  // extras beyond the required set
  ["כיסליו", "kislev"],
  ["כסלווו", "kislev"],
  ["ר״ח כסלו", "kislev"],
  ["ראש חודש כסלו", "kislev"],
  ["ר\"ח כסליו 🙏", "kislev"],
  [VOCALISED_HANUKKAH, "hanukkah"],
  ["חנוכה 0501234567", "hanukkah"],
  ["חנוכה!!!", "hanukkah"],
];

const TRIGGER_NEGATIVES: string[] = [
  "חנוכה שמח",
  "לא כסלו",
  "כסלו או חנוכה",
  "מעוניינת בכסלו",
  "יש חנוכה ?",
  "כסלו 6-10",
  "0501234567",
  "",
  "🙏",
  // extras beyond the required set
  "כסלו מתי?",
  "מה המחיר של כסלו",
  "חנוכה או כסלו",
  'ר"ח כסלו 6-10',
  "ר\"ח חנוכה",
  "כסלוא",
  "אומן",
  "11-15",
  "נובמבר",
  "דצמבר",
  "   ",
];

describe("detectTripTrigger — a message that is ONLY a trip name", () => {
  it.each(TRIGGER_POSITIVES)("fires on %j → %s", (text, trip) => {
    expect(detectTripTrigger(text)).toBe(trip);
  });

  it.each(TRIGGER_NEGATIVES)("does NOT fire on %j", (text) => {
    expect(detectTripTrigger(text)).toBeNull();
  });
});

describe("detectTripTrigger — never disagrees with detectTrip", () => {
  it.each(TRIGGER_POSITIVES)("%j resolves to the same trip in both", (text) => {
    expect(detectTripTrigger(text)).not.toBeNull();
    expect(detectTripTrigger(text)).toBe(detectTrip(text));
  });

  it("whenever the trigger fires, detectTrip names the same trip (positives + negatives corpus)", () => {
    const corpus = [...TRIGGER_POSITIVES.map(([text]) => text), ...TRIGGER_NEGATIVES];
    for (const text of corpus) {
      const fired = detectTripTrigger(text);
      if (fired !== null) expect(detectTrip(text)).toBe(fired);
    }
  });

  it('"כסלו 6-10" stays a non-trigger because detectTrip reads 6-10 as the Hanukkah dates', () => {
    expect(detectTrip("כסלו 6-10")).toBe("hanukkah");
    expect(detectTripTrigger("כסלו 6-10")).toBeNull();
  });

  it('"חנוכה 11-15" still triggers hanukkah — the word wins over the Kislev dates in both functions', () => {
    expect(detectTrip("חנוכה 11-15")).toBe("hanukkah");
    expect(detectTripTrigger("חנוכה 11-15")).toBe("hanukkah");
  });
});
