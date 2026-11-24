import { describe, expect, it } from "vitest";
import { mentionedIds, mentionQueryAt, splitMentions, suggestStaff } from "./mentions";

const MICHAL = { id: "u-michal", name: "מיכל לוי" };
const NOA = { id: "u-noa", name: "נועה" };
const NOA_COHEN = { id: "u-noa-cohen", name: "נועה כהן" };

describe("mentionQueryAt", () => {
  it("finds an @ at the start or after a space, up to the caret", () => {
    expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQueryAt("שלום @מי", 8)).toEqual({ start: 5, query: "מי" });
    expect(mentionQueryAt("שורה\n@נו", 8)).toEqual({ start: 5, query: "נו" });
    // The caret in the middle of the word: only what comes before it.
    expect(mentionQueryAt("@מיכל", 3)).toEqual({ start: 0, query: "מי" });
  });

  it("ignores an @ inside a word, after a space, or with more than 20 letters", () => {
    expect(mentionQueryAt("mail@x", 6)).toBeNull();
    expect(mentionQueryAt("@מיכל ", 6)).toBeNull();
    expect(mentionQueryAt(`@${"א".repeat(20)}`, 21)).not.toBeNull();
    expect(mentionQueryAt(`@${"א".repeat(21)}`, 22)).toBeNull();
  });
});

describe("suggestStaff", () => {
  const people = [MICHAL, NOA_COHEN, { id: "u-dana", name: "Dana Levi" }];

  it("matches a word of the name from its start, and everyone for no letters", () => {
    expect(suggestStaff(people, "")).toEqual(people);
    expect(suggestStaff(people, "לו")).toEqual([MICHAL]);
    expect(suggestStaff(people, "lev")).toEqual([{ id: "u-dana", name: "Dana Levi" }]);
    expect(suggestStaff(people, "יכל")).toEqual([]);
  });

  it("lists at most six", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ id: `u-${index}`, name: `רות ${index}` }));
    expect(suggestStaff(many, "רו")).toHaveLength(6);
  });
});

describe("splitMentions and mentionedIds", () => {
  it("cuts the text at each tag, the longest name first", () => {
    expect(splitMentions("@נועה כהן ו@מיכל לוי, @מיכל לוי", [NOA, NOA_COHEN, MICHAL])).toEqual([
      { person: NOA_COHEN, text: "@נועה כהן" },
      " ו@מיכל לוי, ",
      { person: MICHAL, text: "@מיכל לוי" },
    ]);
    // A name that runs on into a longer word isn't a tag.
    expect(splitMentions("@נועהלה", [NOA])).toEqual(["@נועהלה"]);
    expect(splitMentions("בלי תיוג", [])).toEqual(["בלי תיוג"]);
  });

  it("keeps the remembered people still named, each once", () => {
    expect(mentionedIds("@מיכל לוי @נועה @מיכל לוי", ["u-noa", "u-michal"], [MICHAL, NOA, NOA_COHEN])).toEqual(["u-michal", "u-noa"]);
    expect(mentionedIds("@מיכל", ["u-michal"], [MICHAL])).toEqual([]);
    expect(mentionedIds("@נועה כהן", ["u-noa"], [NOA, NOA_COHEN])).toEqual(["u-noa"]);
  });
});
