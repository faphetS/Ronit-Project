import { describe, expect, it } from "vitest";
import { decideMatch, nameTokens, sameName, type MatchCandidate } from "./passport.match.js";

describe("nameTokens", () => {
  it("drops niqqud, punctuation and final letters", () => {
    expect(nameTokens("שָׂרָה כֹּהֵן")).toEqual(nameTokens("שרה כהן"));
    expect(nameTokens("ג׳ני")).toEqual(["גני"]);
    expect(nameTokens("כהן")).toEqual(["כהנ"]);
  });

  it("upper-cases Latin, drops accents and apostrophes, and splits at hyphens", () => {
    expect(nameTokens("Zoë O'Brien-Levi")).toEqual(["ZOE", "OBRIEN", "LEVI"]);
  });
});

describe("sameName", () => {
  it("ignores word order and a middle name on the passport", () => {
    expect(sameName("שרה רבקה כהן", "כהן שרה")).toBe(true);
    expect(sameName("SARAH RIVKA COHEN", "Sarah Cohen")).toBe(true);
  });

  it("needs at least a first and a last name", () => {
    expect(sameName("שרה", "שרה כהן")).toBe(false);
  });

  it("tells different people apart", () => {
    expect(sameName("שרה כהן", "שרה לוי")).toBe(false);
  });
});

function customer(id: string, firstName: string, lastName: string, phone: string | null, latin?: [string, string]): MatchCandidate {
  return { id, firstName, lastName, phone, firstNameLatin: latin?.[0] ?? null, lastNameLatin: latin?.[1] ?? null };
}

const SARA = { hebrewName: "שרה כהן", latinName: "SARAH COHEN" };

describe("decideMatch", () => {
  it("matches the one customer with the name", () => {
    const decision = decideMatch(SARA, "972501111111", [customer("c1", "שרה", "כהן", null), customer("c2", "רחל", "לוי", null)]);
    expect(decision).toEqual({ kind: "matched", customerId: "c1", reason: "name" });
  });

  it("matches on the Latin name when the card is written in English", () => {
    const decision = decideMatch(SARA, null, [customer("c1", "Sarah", "Cohen", null)]);
    expect(decision).toEqual({ kind: "matched", customerId: "c1", reason: "name" });
  });

  it("says when the name and the phone both match", () => {
    const decision = decideMatch(SARA, "972501111111", [customer("c1", "שרה", "כהן", "972501111111")]);
    expect(decision).toEqual({ kind: "matched", customerId: "c1", reason: "name-and-phone" });
  });

  it("picks the namesake with the sender's number", () => {
    const decision = decideMatch(SARA, "972502222222", [
      customer("c1", "שרה", "כהן", "972501111111"),
      customer("c2", "שרה", "כהן", "972502222222"),
    ]);
    expect(decision).toEqual({ kind: "matched", customerId: "c2", reason: "name-and-phone" });
  });

  it("sends namesakes without the sender's number to review", () => {
    const decision = decideMatch(SARA, "972503333333", [customer("c1", "שרה", "כהן", null), customer("c2", "שרה", "כהן", null)]);
    expect(decision).toEqual({ kind: "needs-review", reason: "several-name-matches", candidateIds: ["c1", "c2"] });
  });

  it("makes a new card, noting whose number sent it", () => {
    const decision = decideMatch(SARA, "972501111111", [customer("mom", "רחל", "כהן", "972501111111")]);
    expect(decision).toEqual({ kind: "new-card", reason: "phone-of-other-customer", phoneOwnerId: "mom" });
  });

  it("makes a new card when nobody has the name", () => {
    expect(decideMatch(SARA, null, [])).toEqual({ kind: "new-card", reason: "no-match", phoneOwnerId: null });
  });
});
