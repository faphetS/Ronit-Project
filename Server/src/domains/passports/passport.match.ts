/**
 * Who a passport belongs to. The PRD's rule: search the CRM for a customer with the same
 * name; add the passport to that customer, or create a new one with the sender's number.
 */

const FINAL_LETTERS: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

/**
 * The words of a name, comparable across spellings: niqqud and accents dropped, final
 * letters as regular ones, geresh, gershayim and apostrophes removed (ג׳ני is one word),
 * any other punctuation as a space, Latin in upper case.
 */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[ךםןףץ]/g, (letter) => FINAL_LETTERS[letter] ?? letter)
    .replace(/[׳״'’"`]/g, "")
    .toUpperCase()
    .replace(/[^\p{L}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Same person when every word of the shorter name is in the longer one, in any order, so a
 * middle name on the passport still matches. The shorter name needs two words: a first
 * name alone matches too many people.
 */
export function sameName(a: string, b: string): boolean {
  const tokensA = nameTokens(a);
  const tokensB = nameTokens(b);
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  if (shorter.length < 2) return false;
  return shorter.every((token) => longer.includes(token));
}

export interface MatchCandidate {
  id: string;
  firstName: string;
  lastName: string;
  firstNameLatin: string | null;
  lastNameLatin: string | null;
  phone: string | null;
}

/** The names printed on the passport, "given surname"; null when the passport has none. */
export interface PassportPerson {
  hebrewName: string | null;
  latinName: string | null;
}

export type MatchDecision =
  | { kind: "matched"; customerId: string; reason: "name" | "name-and-phone" }
  | { kind: "new-card"; reason: "no-match" | "phone-of-other-customer"; phoneOwnerId: string | null }
  | { kind: "needs-review"; reason: "several-name-matches"; candidateIds: string[] };

function joinName(first: string | null, last: string | null): string | null {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || null;
}

function namesMatch(person: PassportPerson, customer: MatchCandidate): boolean {
  const crmName = joinName(customer.firstName, customer.lastName);
  const crmLatin = joinName(customer.firstNameLatin, customer.lastNameLatin);
  const crmNames = [crmName, crmLatin].filter((name): name is string => name !== null);
  const passportNames = [person.hebrewName, person.latinName].filter((name): name is string => name !== null);
  return passportNames.some((passportName) => crmNames.some((crm) => sameName(passportName, crm)));
}

/**
 * - One customer with the name → that customer.
 * - Several → the one with the sender's number, if exactly one has it; otherwise review.
 * - None → a new card with the sender's number. When that number already belongs to
 *   another customer (a parent sending a child's passport), the reason says so.
 */
export function decideMatch(person: PassportPerson, senderPhone: string | null, candidates: MatchCandidate[]): MatchDecision {
  const named = candidates.filter((customer) => namesMatch(person, customer));

  if (named.length === 1) {
    const customer = named[0]!;
    const reason = senderPhone !== null && customer.phone === senderPhone ? "name-and-phone" : "name";
    return { kind: "matched", customerId: customer.id, reason };
  }

  if (named.length > 1) {
    const withPhone = senderPhone === null ? [] : named.filter((customer) => customer.phone === senderPhone);
    if (withPhone.length === 1) return { kind: "matched", customerId: withPhone[0]!.id, reason: "name-and-phone" };
    return { kind: "needs-review", reason: "several-name-matches", candidateIds: named.map((customer) => customer.id) };
  }

  const phoneOwner = senderPhone === null ? undefined : candidates.find((customer) => customer.phone === senderPhone);
  return phoneOwner
    ? { kind: "new-card", reason: "phone-of-other-customer", phoneOwnerId: phoneOwner.id }
    : { kind: "new-card", reason: "no-match", phoneOwnerId: null };
}
