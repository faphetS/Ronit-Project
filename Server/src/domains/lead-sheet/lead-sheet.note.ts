import type { SheetLead } from "./lead-sheet.parse.js";

/** The Monday note on a lead the sheet sync added: where she came from, when, and her answers. */

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });

/** 31.10.2026, in Israel. */
export const israelDate = (at: Date) => day.format(at).replace(/\//g, ".");

/** "שאלון חנוכה -0.1-copy" → "שאלון חנוכה": the form's name without Meta's version and copy marks. */
export function formLabel(formName: string): string {
  const label = formName
    .replace(/[-–\s]*copy$/i, "")
    .replace(/\s*[-–]\s*[\d.]+$/, "")
    .trim();
  return label || formName.trim();
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface OldCard {
  board: string;
  /** When she first came, YYYY-MM-DD or an ISO time. */
  since: Date;
}

/** The note, as Monday update HTML (right to left), in the wording of the leads added by hand on 2026-11-03. */
export function leadNoteHtml(lead: SheetLead, oldCard: OldCard | null): string {
  const where = lead.platform === "fb" ? "בפייסבוק" : lead.platform === "ig" ? "באינסטגרם" : "במטא";
  const lines = [
    `נוסף מגיליון הלידים של מטא (טופס "${formLabel(lead.formName)}"), כי הליד לא הגיע למאנדיי.`,
    `מילא/ה את הטופס ${where} ב-${israelDate(lead.createdAt)} בשעה ${time.format(lead.createdAt)}.`,
    ...lead.answers.filter((a) => a.answer).map((a) => (/[?:.]$/.test(a.question) ? `${a.question} ${a.answer}` : `${a.question}: ${a.answer}`)),
  ];
  if (oldCard) lines.push(`פנייה חוזרת: יש כרטיס ישן בלוח "${oldCard.board}" מ-${israelDate(oldCard.since)}.`);
  return `<div dir="rtl" style="text-align: right">${lines.map(escape).join("<br>")}</div>`;
}
