/**
 * Reading a Google Sheet of Meta lead-form leads (the sheet Meta's form fills, exported as CSV):
 * one row per lead, with Meta's columns (id, created_time, form_name, platform, …), the form's own
 * questions, then full_name, phone_number and email.
 */

/** RFC 4180 CSV: fields in quotes may hold commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface SheetLead {
  /** Meta's lead id. */
  leadId: string;
  createdAt: Date;
  platform: "fb" | "ig" | null;
  /** Meta's is_organic: the form was opened without an ad. */
  organic: boolean;
  formName: string;
  fullName: string;
  /** Israeli numbers as 05…, others as digits; null without a usable number. */
  phone: string | null;
  email: string | null;
  /** The form's own questions and her answers, in the sheet's order. */
  answers: Array<{ question: string; answer: string }>;
  /** Meta's test lead ("<test lead: dummy data …>"). */
  test: boolean;
}

const CONTACT_COLUMNS = ["full_name", "phone_number", "email"];

/** "+972 52-123-4567" → "0521234567"; foreign numbers stay digits. */
export function localPhone(text: string): string | null {
  let digits = text.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("9720")) digits = `972${digits.slice(4)}`;
  if (digits.startsWith("972") && digits.length === 12) return `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
}

/** Meta writes a question's column as its text with underscores for spaces. */
const questionText = (column: string) => column.replace(/_/g, " ").replace(/\s+/g, " ").trim();

/** The leads in a sheet, in its order. Rows without a Meta id are left out. */
export function sheetLeads(csv: string): SheetLead[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const col = (name: string) => header.indexOf(name);
  const firstContact = Math.min(...CONTACT_COLUMNS.map(col).filter((i) => i >= 0));
  const questions = header.map((name, i) => ({ name, i })).filter(({ i }) => i > col("platform") && i < firstContact);
  const cell = (row: string[], name: string) => (col(name) >= 0 ? (row[col(name)] ?? "").trim() : "");

  return rows.flatMap((row): SheetLead[] => {
    const leadId = cell(row, "id").replace(/^l:/, "");
    const createdAt = new Date(cell(row, "created_time"));
    if (!leadId || Number.isNaN(createdAt.getTime())) return [];
    const platform = cell(row, "platform");
    const email = cell(row, "email");
    return [
      {
        leadId,
        createdAt,
        platform: platform === "fb" || platform === "ig" ? platform : null,
        organic: cell(row, "is_organic").toLowerCase() === "true",
        formName: cell(row, "form_name"),
        fullName: cell(row, "full_name").replace(/\s+/g, " "),
        phone: localPhone(cell(row, "phone_number")),
        email: email.includes("@") ? email : null,
        answers: questions.map(({ name, i }) => ({ question: questionText(name), answer: (row[i] ?? "").trim() })),
        test: row.some((value) => value.trim().startsWith("<test lead")),
      },
    ];
  });
}
