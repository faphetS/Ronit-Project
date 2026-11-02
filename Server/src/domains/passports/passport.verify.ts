import { parseTd3 } from "../../lib/passport-mrz.js";
import type { PassportReading } from "../../lib/passport-reader.js";

export interface PersonName {
  first: string;
  last: string;
}

/** A passport whose MRZ check digits hold: safe to write into a customer card. */
export interface VerifiedPassport {
  number: string;
  nationality: string;
  sex: "F" | "M" | "X";
  /** YYYY-MM-DD */
  birthDate: string;
  /** YYYY-MM-DD */
  expiryDate: string;
  /** YYYY-MM-DD; not in the MRZ, so as the AI read it (null if it isn't a real date). */
  issueDate: string | null;
  hebrew: PersonName | null;
  latin: PersonName | null;
}

export type Verification =
  | { kind: "verified"; passport: VerifiedPassport }
  | { kind: "not-passport" }
  | { kind: "review"; reason: "mrz-unverified" | "low-confidence" | "no-name" };

function realDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function personName(first: string | null, last: string | null): PersonName | null {
  const trimmedFirst = first?.trim() ?? "";
  const trimmedLast = last?.trim() ?? "";
  return trimmedFirst && trimmedLast ? { first: trimmedFirst, last: trimmedLast } : null;
}

/**
 * Decides whether a reading can go straight into a customer card. It can only when the MRZ
 * check digits hold, the model is confident enough and the passport carries a name. The
 * number, dates, sex and nationality then come from the MRZ, which is checksummed; the
 * names come from the printed fields (the MRZ drops spaces, accents and Hebrew).
 */
export function verifyReading(reading: PassportReading, today: Date, minConfidence: number): Verification {
  if (!reading.isPassport) return { kind: "not-passport" };

  const mrz = reading.mrzLine2 ? parseTd3(reading.mrzLine1, reading.mrzLine2, today) : null;
  if (!mrz) return { kind: "review", reason: "mrz-unverified" };
  if (reading.confidence < minConfidence) return { kind: "review", reason: "low-confidence" };

  const hebrew = personName(reading.givenNamesHebrew, reading.surnameHebrew);
  const latin = personName(reading.givenNamesLatin, reading.surnameLatin) ?? personName(mrz.givenNames, mrz.surname);
  if (!hebrew && !latin) return { kind: "review", reason: "no-name" };

  return {
    kind: "verified",
    passport: {
      number: mrz.documentNumber,
      nationality: mrz.nationality,
      sex: mrz.sex,
      birthDate: mrz.birthDate,
      expiryDate: mrz.expiryDate,
      issueDate: realDate(reading.issueDate),
      hebrew,
      latin,
    },
  };
}
