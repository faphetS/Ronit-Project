/**
 * The machine-readable zone of a passport (ICAO 9303, TD3: two lines of 44 characters).
 * Its check digits are what make an AI reading of a passport photo trustworthy: a misread
 * digit in the number or a date fails its check, so the passport goes to a person instead
 * of straight into a customer card.
 */

export interface MrzPassport {
  documentNumber: string;
  /** ISO 3166 alpha-3 as printed, e.g. "ISR". */
  nationality: string;
  /** YYYY-MM-DD */
  birthDate: string;
  sex: "F" | "M" | "X";
  /** YYYY-MM-DD */
  expiryDate: string;
  /** From line 1, when it reads as a passport line; null otherwise. */
  surname: string | null;
  givenNames: string | null;
}

const WEIGHTS = [7, 3, 1] as const;

function charValue(char: string): number | null {
  if (char === "<") return 0;
  const code = char.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 65 && code <= 90) return code - 55; // A-Z → 10-35
  return null;
}

/** The ICAO check digit of a field, or null when it holds a character an MRZ can't. */
export function mrzCheckDigit(field: string): number | null {
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) {
    const value = charValue(field[i] as string);
    if (value === null) return null;
    sum += value * WEIGHTS[i % 3]!;
  }
  return sum % 10;
}

// Characters an OCR pass confuses with digits. Applied only where the MRZ allows digits
// alone (dates and check digits); the check digits then catch a wrong repair.
const DIGIT_LOOKALIKES: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8" };

function asDigits(field: string): string {
  return field.replace(/[OQDILZSGB]/g, (char) => DIGIT_LOOKALIKES[char] ?? char);
}

function normalizeLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/[«‹〈＜]/g, "<")
    .replace(/\s+/g, "");
}

function checks(field: string, checkChar: string): boolean {
  const expected = charValue(checkChar);
  const actual = mrzCheckDigit(field);
  return expected !== null && expected <= 9 && actual === expected;
}

function mrzDate(yymmdd: string, century: (yy: number) => number): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  const year = century(yy) + yy;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseNames(line1: string): { surname: string; givenNames: string } | null {
  if (line1.length !== 44 || line1[0] !== "P") return null;
  const names = line1.slice(5);
  const split = names.indexOf("<<");
  const surname = (split === -1 ? names : names.slice(0, split)).replace(/</g, " ").trim();
  const givenNames = split === -1 ? "" : names.slice(split + 2).replace(/</g, " ").replace(/\s+/g, " ").trim();
  return surname ? { surname, givenNames } : null;
}

/**
 * Reads a TD3 passport MRZ. Returns null unless line 2 is 44 characters and every check
 * digit holds (number, birth date, expiry date, personal number and the composite).
 */
export function parseTd3(line1: string | null | undefined, line2: string, today: Date): MrzPassport | null {
  const raw = normalizeLine(line2);
  if (raw.length !== 44) return null;

  // Digits-only positions: birth date + check, expiry + check, the last two checks.
  const line = [
    raw.slice(0, 13),
    asDigits(raw.slice(13, 20)),
    raw[20],
    asDigits(raw.slice(21, 28)),
    raw.slice(28, 42),
    asDigits(raw.slice(42, 44)),
  ].join("");

  const number = line.slice(0, 9);
  const birth = line.slice(13, 19);
  const expiry = line.slice(21, 27);
  const personal = line.slice(28, 42);
  const composite = line.slice(0, 10) + line.slice(13, 20) + line.slice(21, 43);

  if (!checks(number, line[9]!) || !checks(birth, line[19]!) || !checks(expiry, line[27]!)) return null;
  if (!checks(personal, line[42]!) || !checks(composite, line[43]!)) return null;

  const sexChar = line[20];
  if (sexChar !== "F" && sexChar !== "M" && sexChar !== "<") return null;

  const currentYy = today.getUTCFullYear() % 100;
  const birthDate = mrzDate(birth, (yy) => (yy > currentYy ? 1900 : 2000));
  const expiryDate = mrzDate(expiry, () => 2000);
  if (!birthDate || !expiryDate) return null;

  const names = line1 ? parseNames(normalizeLine(line1)) : null;
  return {
    documentNumber: number.replace(/</g, ""),
    nationality: line.slice(10, 13).replace(/</g, ""),
    birthDate,
    sex: sexChar === "<" ? "X" : sexChar,
    expiryDate,
    surname: names?.surname ?? null,
    givenNames: names?.givenNames || null,
  };
}
