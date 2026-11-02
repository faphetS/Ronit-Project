import { mrzCheckDigit } from "./passport-mrz.js";

/** For tests: the two MRZ lines of a TD3 passport, with correct check digits. Dates are YYMMDD. */
export function buildTd3(fields: {
  surname: string;
  givenNames: string;
  number: string;
  nationality: string;
  birth: string;
  sex: "F" | "M" | "<";
  expiry: string;
  personal?: string;
}): { line1: string; line2: string } {
  const pad = (value: string, length: number) => (value + "<".repeat(length)).slice(0, length);
  const withCheck = (value: string) => value + String(mrzCheckDigit(value));

  const number = withCheck(pad(fields.number, 9));
  const birth = withCheck(fields.birth);
  const expiry = withCheck(fields.expiry);
  const personal = withCheck(pad(fields.personal ?? "", 14));
  const composite = mrzCheckDigit(number + birth + expiry + personal);

  const names = `${fields.surname.replace(/ /g, "<")}<<${fields.givenNames.replace(/ /g, "<")}`;
  return {
    line1: pad(`P<${fields.nationality}${names}`, 44),
    line2: number + fields.nationality + birth + fields.sex + expiry + personal + String(composite),
  };
}
