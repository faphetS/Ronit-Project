import { describe, it, expect } from "vitest";
import {
  detectTrip,
  detectTripName,
  detectTripTrigger,
  hasNegationWord,
  tripMentions,
  type Trip,
} from "./trip.js";

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

// The trip-stage fast path trusts detectTrip only for an answer that names exactly ONE trip
// and negates nothing. detectTrip alone reads "כסלו או חנוכה" and "לא חנוכה" as Hanukkah.
describe("tripMentions — every trip a message names", () => {
  const SINGLE: Array<[string, Trip[]]> = [
    ["כסלו", ["kislev"]],
    ['ר"ח כסלו', ["kislev"]],
    ["נובמבר", ["kislev"]],
    ["11-15", ["kislev"]],
    ["11-15/11", ["kislev"]],
    ["11.11", ["kislev"]],
    [VOCALISED_KISLEV, ["kislev"]],
    ["חנוכה", ["hanukkah"]],
    ["חנוכה בבקשה", ["hanukkah"]],
    ["דצמבר", ["hanukkah"]],
    ["6-10", ["hanukkah"]],
    ["6-10/12", ["hanukkah"]],
    ["06.12", ["hanukkah"]],
    [VOCALISED_HANUKKAH, ["hanukkah"]],
    // a month number and a single day inside a trip window
    ["לחודש 11", ["kislev"]],
    ["לחודש 12", ["hanukkah"]],
    ["12/11", ["kislev"]],
    ["15/11/26", ["kislev"]],
    ["7/12", ["hanukkah"]],
    ["10/12/26", ["hanukkah"]],
  ];

  it.each(SINGLE)("%j → exactly %j", (text, expected) => {
    expect(tripMentions(text)).toEqual(expected);
  });

  it.each(["כסלו או חנוכה", "חנוכה בכסלו", "גם כסלו וגם חנוכה", "נובמבר או דצמבר", "11-15 או 6-10", "כסלו 6-10"])(
    "%j names both, in the order the question lists them (kislev first)",
    (text) => {
      expect(tripMentions(text)).toEqual(["kislev", "hanukkah"]);
    },
  );

  it.each(["", "אני מעוניינת", "לחודש 1", "אוקטובר", "06/10-12/10/26", "הראשון", "0501234567", "אומן"])(
    "%j names no trip",
    (text) => {
      expect(tripMentions(text)).toEqual([]);
    },
  );

  it("does not look at negation — \"לא חנוכה\" still mentions Hanukkah", () => {
    expect(tripMentions("לא חנוכה")).toEqual(["hanukkah"]);
  });

  it("strips niqqud first, like detectTrip: a vocalised pair is still two mentions", () => {
    expect(tripMentions(`${VOCALISED_KISLEV} או ${VOCALISED_HANUKKAH}`)).toEqual(["kislev", "hanukkah"]);
  });

  it("detectTrip is unchanged: given both trips it still answers hanukkah (checked first)", () => {
    expect(detectTrip("כסלו או חנוכה")).toBe("hanukkah");
    expect(detectTrip("לא חנוכה")).toBe("hanukkah");
  });

  it("agrees with detectTrip on every text: none → null, one → that trip, both → hanukkah", () => {
    const corpus = [
      ...SINGLE.map(([text]) => text),
      ...TRIGGER_POSITIVES.map(([text]) => text),
      ...TRIGGER_NEGATIVES,
      "כסלו או חנוכה",
      "חנוכה בכסלו",
      "לחודש 11",
      "06/10-12/10/26",
    ];
    for (const text of corpus) {
      const mentioned = tripMentions(text);
      if (mentioned.length === 0) expect(detectTrip(text), text).toBeNull();
      else if (mentioned.length === 1) expect(detectTrip(text), text).toBe(mentioned[0]);
      else expect(detectTrip(text), text).toBe("hanukkah");
    }
  });
});

describe("hasNegationWord — a standalone לא / אין / בלי", () => {
  const VOCALISED_LO = "\u05DC\u05B9\u05D0"; // לֹא

  it.each([
    "לא חנוכה",
    "חנוכה לא",
    "לא, חנוכה",
    "לא!",
    "(לא)",
    "חנוכה - לא",
    "אני לא יודעת",
    "אין לי בעיה",
    "אין",
    "בלי חנוכה",
    "חנוכה בלי",
    "לא\nחנוכה",
    "לא🙏",
    `${VOCALISED_LO} חנוכה`,
  ])("%j → true", (text) => {
    expect(hasNegationWord(text)).toBe(true);
  });

  it.each([
    "חנוכה",
    "חנוכה בבקשה",
    "11-15",
    "",
    // "לאומן" (to Uman) is the commonest word in this inbox: a substring check would flag it
    "אני רוצה לאומן",
    "לאומן בחנוכה",
    // longer words that merely contain the letters
    "מלא תודה, חנוכה",
    "חנוכה בלילה",
    "בליל חנוכה",
    "אלא חנוכה",
  ])("%j → false (the letters are part of a longer word)", (text) => {
    expect(hasNegationWord(text)).toBe(false);
  });
});

// Dates are day/month, so a month glued to a range ("6-10/10") is the number after the separator
// and has to be the trip's: 6-10/10 is 6-10 OCTOBER, not Hanukkah. 2026-10-12 live run: the
// same day/month confusion made the judge read "06/10-12/10/26" as Hanukkah. A range with no
// month at all keeps its meaning.
describe("detectTrip — a hanukkah date range", () => {
  it.each([
    "6-10",
    "6-10/12",
    "6–10.12", // en dash and a dot separator
    "6-10.12",
    "06-10/12/26",
    "6–10",
    "6 - 10",
    "הנסיעה של 6-10/12/26 מתאימה",
    "6-10/012",
    "6-10/12-2026",
  ])("%j → hanukkah", (text) => {
    expect(detectTrip(text)).toBe("hanukkah");
  });

  it.each([
    "6-10/10",
    "6-10/11",
    "06-10/10/26",
    "6–10.11",
    "6-10.10",
    "6-10/1",
    "6-10/10-2026", // a year after the month, not another range
    "הנסיעה של 6-10/10 מתאימה",
  ])("%j → no trip: the range is in another month", (text) => {
    expect(detectTrip(text)).toBeNull();
  });
});

describe("detectTrip — a kislev date range", () => {
  it.each([
    "11-15",
    "11-15/11",
    "11-15/11/26",
    "11–15.11", // en dash and a dot separator
    "11-15.11",
    "11–15",
    "הנסיעה של 11-15/11/26 מתאימה",
    "11-15/011",
  ])("%j → kislev", (text) => {
    expect(detectTrip(text)).toBe("kislev");
  });

  it.each([
    "11-15/12",
    "11-15/10",
    "11-15.12",
    "11–15/12",
    "11-15/12-2026", // a year after the month, not another range
    "הנסיעה של 11-15/12 מתאימה",
  ])("%j → no trip: the range is in another month", (text) => {
    expect(detectTrip(text)).toBeNull();
  });
});

describe("tripMentions — date ranges", () => {
  it("a range in another month names no trip", () => {
    expect(tripMentions("6-10/10")).toEqual([]);
    expect(tripMentions("11-15/12")).toEqual([]);
    expect(tripMentions("6-10/11")).toEqual([]);
  });

  it.each(["6-10/12 או 11-15/11", "11-15 / 6-10", "6-10 11-15"])("%j lists both ranges → both trips", (text) => {
    expect(tripMentions(text)).toEqual(["kislev", "hanukkah"]);
  });

  // A number that opens the NEXT range is not a month: "6-10/11-15" is two ranges, not 6-10 November.
  it.each(["6-10/11-15", "11-15/6-10"])("%j: the number after the slash opens the next range, not a month", (text) => {
    expect(tripMentions(text)).toEqual(["kislev", "hanukkah"]);
  });

  it("a wrong-month occurrence does not hide a right one", () => {
    expect(tripMentions("6-10/10 או 6-10/12")).toEqual(["hanukkah"]);
    expect(tripMentions("6-10/10 11-15/11")).toEqual(["kislev"]);
  });
});

// The fix must not take away anything detectTrip recognised before: every positive the suite had
// (plus the trigger corpus), in one place.
describe("detectTrip — nothing recognised before the month fix is lost", () => {
  const PREVIOUSLY_RECOGNISED: Array<[string, Trip]> = [
    ["מעוניינת בנסיעת חנוכה", "hanukkah"],
    [VOCALISED_HANUKKAH, "hanukkah"],
    ["אני פנויה בדצמבר", "hanukkah"],
    ["6-10 מתאים לי", "hanukkah"],
    ["הנסיעה של 6-10/12", "hanukkah"],
    ["יוצאים ב-06.12", "hanukkah"],
    ["יוצאים ב-06/12", "hanukkah"],
    ["מעוניינת בכסלו", "kislev"],
    ['הנסיעה של ר"ח כסלו מתאימה לי', "kislev"],
    ["מעוניינת בכסליו", "kislev"],
    ["מעוניינת בכיסלו", "kislev"],
    ["מעוניינת בכיסליו", "kislev"],
    [VOCALISED_KISLEV, "kislev"],
    ["אני פנויה בנובמבר", "kislev"],
    ["11-15 מתאים לי", "kislev"],
    ["הנסיעה של 11-15/11", "kislev"],
    ["יוצאים ב-11.11", "kislev"],
    // Hanukkah is still checked first
    ["הנסיעה של 6-10/12, זה גם בכסלו נכון?", "hanukkah"],
    ["נסיעת חנוכה שיוצאת בכסלו", "hanukkah"],
    ["כסלו 6-10", "hanukkah"],
    ["חנוכה 11-15", "hanukkah"],
    ...TRIGGER_POSITIVES,
  ];

  it.each(PREVIOUSLY_RECOGNISED)("%j → %s", (text, trip) => {
    expect(detectTrip(text)).toBe(trip);
  });
});

describe("detectTripTrigger — unchanged by the month fix", () => {
  it('a bare 6-10 after the word still blocks the trigger (detectTrip reads it as the Hanukkah dates)', () => {
    expect(detectTripTrigger("כסלו 6-10")).toBeNull();
    expect(detectTripTrigger('ר"ח כסלו 6-10')).toBeNull();
  });

  it('"כסלו 6-10/10": the digits are an October date, no longer Hanukkah, so detectTrip agrees with the word and the trigger fires', () => {
    expect(detectTrip("כסלו 6-10/10")).toBe("kislev");
    expect(detectTripTrigger("כסלו 6-10/10")).toBe("kislev");
  });
});

// A trip's NAME is the only thing that says "Uman" without the lead saying so. A month, a month
// number or a date does not: "פנויה ב30/11?" can be the date of a challah event.
describe("detectTripName — a trip named by its NAME only", () => {
  it.each<[string, Trip]>([
    ["חנוכה", "hanukkah"],
    ["מעוניינת בנסיעת חנוכה", "hanukkah"],
    [VOCALISED_HANUKKAH, "hanukkah"],
    ["כסלו", "kislev"],
    ["כסליו", "kislev"],
    ["כיסלו", "kislev"],
    ["כיסליו", "kislev"],
    ['ר"ח כסלו', "kislev"],
    ['מעוניינת בנסיעה של ר"ח כסלו', "kislev"],
    [VOCALISED_KISLEV, "kislev"],
    ["מעוניינת בכסלו", "kislev"],
  ])("%j → %s", (text, trip) => {
    expect(detectTripName(text)).toBe(trip);
  });

  // Same reason as detectTrip's own order: the Hanukkah trip falls in the month of Kislev.
  it.each(["חנוכה בכסלו", "כסלו או חנוכה", "נסיעת חנוכה שיוצאת בכסלו"])(
    "%j carries both words → hanukkah (checked first)",
    (text) => {
      expect(detectTripName(text)).toBe("hanukkah");
    },
  );

  it.each([
    "נובמבר",
    "דצמבר",
    "לחודש 11",
    "לחודש 12",
    "חדש 11",
    "11-15",
    "6-10",
    "11-15/11",
    "6-10/12",
    "12/11",
    "7/12",
    "11.11",
    "06.12",
    "יהיה בסוף דצמבר?",
    "היי אפשר פרטים על הטיסה בנובמבר?",
    "פנויה ב30/11",
    "אומן",
    "הראשון",
    "השני",
    "0501234567",
    "אני מעוניינת",
    "",
    "   ",
  ])("%j → null: a month, a month number or a date is not a name", (text) => {
    expect(detectTripName(text)).toBeNull();
  });

  describe("a Hebrew-calendar day of Kislev is a DATE, not the trip's name", () => {
    // 2026-10: a real lead asked whether Ronit was free for a birthday challah event on 25 Kislev.
    // Reading the כסלו in it as the trip would have sent her the flight pitch.
    const BIRTHDAY_SENTENCE = "רציתי לשאול אם את פנויה בתאריך 5.12, כ״ה בכסלו. אני חוגגת יום הולדת";

    it.each([
      "כ״ה בכסלו",
      'כ"ה בכסלו',
      "ג׳ בכסלו",
      "ג' כסלו",
      "י״ב בכסלו",
      "ט״ו בכסלו",
      'ט"ז בכסלו',
      "ל׳ בכסלו",
      "כה בכסלו",
      "5 בכסלו",
      "25 בכסליו",
      "25 כסלו",
      "ב-25 בכסלו",
      "ביום כ״ה בכסלו",
      "מה עם כ״ה בכסלו?",
      // the preposition written onto the day
      "בכ״ה בכסלו",
      'בכ"ה בכסלו',
      "בג׳ בכסלו",
      "ב25 בכסלו",
      "לכ״ה בכסלו",
      BIRTHDAY_SENTENCE,
    ])("%j → null: a calendar date", (text) => {
      expect(detectTripName(text)).toBeNull();
    });

    it.each<[string, Trip]>([
      ["ר״ח כסלו", "kislev"], // the ח follows ״ — it is not "8 Kislev"
      ['ר"ח כסלו', "kislev"],
      ["ר'ח כסלו", "kislev"],
      ["רח כסלו", "kislev"],
      ["ראש חודש כסלו", "kislev"],
      ["מעוניינת בכסלו", "kislev"],
      ["נסיעה בכסלו", "kislev"], // the ה is the end of "נסיעה", not "5"
      ["כסלו", "kislev"],
      ["מה המחיר לכסלו?", "kislev"],
      ["חנוכה או כסלו", "hanukkah"], // hanukkah is checked first
      ["11-15/11 ר״ח כסלו", "kislev"],
      ["ר״ח כסלו — יש מקום בג׳ בכסלו?", "kislev"], // the name AND a date: the name stays
      // ordinary words that end in a letter which is also a numeral
      ["רשמי לי כסלו", "kislev"],
      ["לא כסלו", "kislev"],
      ["מה כסלו", "kislev"],
      ["בא כסלו", "kislev"],
      ["אני רוצה את כסלו", "kislev"],
    ])("%j → %s: still the trip's name", (text, trip) => {
      expect(detectTripName(text)).toBe(trip);
    });

    it("only detectTripName drops the date — once she has chosen Uman, detectTrip, tripMentions and the trigger are unchanged", () => {
      expect(detectTrip("כ״ה בכסלו")).toBe("kislev");
      expect(tripMentions("כ״ה בכסלו")).toEqual(["kislev"]);
      expect(detectTrip(BIRTHDAY_SENTENCE)).toBe("kislev");
      expect(detectTripTrigger("כסלו")).toBe("kislev");
    });
  });

  it("looks at the name alone, whatever dates sit beside it: detectTrip reads כסלו 6-10 as hanukkah, the name is kislev", () => {
    expect(detectTrip("כסלו 6-10")).toBe("hanukkah");
    expect(detectTripName("כסלו 6-10")).toBe("kislev");
    expect(detectTripName("חנוכה 11-15")).toBe("hanukkah");
  });

  it("every name is also a mention: whatever detectTripName finds, detectTrip and tripMentions see too", () => {
    const corpus = [
      ...TRIGGER_POSITIVES.map(([text]) => text),
      ...TRIGGER_NEGATIVES,
      "חנוכה בכסלו",
      "כסלו 6-10",
      "חנוכה 11-15",
      "לחודש 11",
      "יהיה בסוף דצמבר?",
      "12/11",
    ];
    for (const text of corpus) {
      const name = detectTripName(text);
      if (name === null) continue;
      expect(detectTrip(text), text).not.toBeNull();
      expect(tripMentions(text), text).toContain(name);
    }
  });
});

// A lead who answers "לחודש 11" means November (the Kislev trip), "לחודש 12" December (the
// Hanukkah trip). 2026-10-11: @lihi_lugasi wrote exactly that and the keyword layer missed it.
describe("detectTrip — a month NUMBER", () => {
  it.each([
    "חודש 11",
    "לחודש 11",
    "בחודש 11",
    "חדש 11", // the defective spelling
    "לחדש 11",
    "בחדש 11",
    "חודש11",
    "לחודש 011",
    "ולחודש 11",
    "אני פנויה לחודש 11 אם אפשר",
    "לחודש 11, המספר שלי 0501234567",
    "יש משהו בחודש 11?",
  ])("%j → kislev", (text) => {
    expect(detectTrip(text)).toBe("kislev");
    expect(tripMentions(text)).toEqual(["kislev"]);
  });

  it.each([
    "חודש 12",
    "לחודש 12",
    "בחודש 12",
    "חדש 12",
    "לחדש 12",
    "בחדש 12",
    "חודש12",
    "לחודש 012",
    "ולחודש 12",
    "אני פנויה לחודש 12 אם אפשר",
    "לחודש 12, המספר שלי 0501234567",
    "יש משהו בחודש 12?",
  ])("%j → hanukkah", (text) => {
    expect(detectTrip(text)).toBe("hanukkah");
    expect(tripMentions(text)).toEqual(["hanukkah"]);
  });

  it.each([
    "חודש 1",
    "חודש 10",
    "לחודש 13",
    "חודש 112", // part of a longer number
    "לחודש 110",
    "חודש 1111",
    "חודש 121",
    "לחודש 120",
    "חודש",
    "11 לחודש", // the number BEFORE the word is a day of the month
    "מחדש 11", // "anew" — the prefix מ is not read as "of the month"
    "החודש הבא",
  ])("%j → no trip", (text) => {
    expect(detectTrip(text)).toBeNull();
    expect(tripMentions(text)).toEqual([]);
  });

  it("names both trips when she writes both month numbers", () => {
    expect(tripMentions("לחודש 11 או לחודש 12")).toEqual(["kislev", "hanukkah"]);
    expect(tripMentions("לחודש 11 ולחודש 12")).toEqual(["kislev", "hanukkah"]);
  });
});

// Israeli order, day/month. A single day inside a trip window picks that trip — 11..15 of month
// 11 is Kislev, 6..10 of month 12 is Hanukkah, with or without a year. Another day, another month,
// a time or a phone number stays out.
describe("detectTrip — a single day inside a trip window", () => {
  it.each([
    "12/11",
    "13.11",
    "14/11",
    "15/11",
    "11/11",
    "15/11/26",
    "14/11/2026",
    "יוצאים ב-12.11",
    "יום חמישי 12/11",
    "012.11", // zero padding, as the range and 11.11 forms allow
    "13/011",
  ])("%j → kislev", (text) => {
    expect(detectTrip(text)).toBe("kislev");
    expect(tripMentions(text)).toEqual(["kislev"]);
  });

  it.each([
    "6/12",
    "7/12",
    "8/12",
    "9/12",
    "10/12",
    "08.12",
    "10/12/26",
    "06.12.2026",
    "יום שני 7/12",
    "06/012",
    "010.12",
  ])("%j → hanukkah", (text) => {
    expect(detectTrip(text)).toBe("hanukkah");
    expect(tripMentions(text)).toEqual(["hanukkah"]);
  });

  it.each([
    "30/11", // a day after the Kislev window
    "5/11",
    "16/11",
    "10/11",
    "6/11",
    "21/11",
    "1/12", // a day outside the Hanukkah window
    "5.12",
    "11/12",
    "15/12",
    "16.12",
    "31/12",
    "6/10", // the right days in October
    "12/10",
    "11/10",
    "29.6",
    "111/11", // part of a longer number
    "11.15",
    "11:15", // a time
    "10:12",
    "0501112345", // a phone number
    "050-111-2345",
    "הטלפון שלי 0501112345",
    "חודש 1",
  ])("%j → no trip", (text) => {
    expect(detectTrip(text)).toBeNull();
    expect(tripMentions(text)).toEqual([]);
  });

  it("names both trips when she gives a day of each", () => {
    expect(tripMentions("12/11 או 7/12")).toEqual(["kislev", "hanukkah"]);
    expect(detectTrip("12/11 או 7/12")).toBe("hanukkah");
  });

  it("a single day agrees with the range that holds it", () => {
    expect(detectTrip("11-15/11")).toBe("kislev");
    expect(detectTrip("8-12/11")).toBe("kislev");
    expect(detectTrip("7-10/12")).toBe("hanukkah");
  });
});
