import type { Copy, Locale } from "../../content/copy";
import type { FieldMapping, ImportRun, ImportStep } from "../../data/types";
import { isoDay, now } from "../../lib/clock";
import { formatDate, formatRelative, formatTime } from "../../lib/format";
import type { StatusTone } from "../../ui/StatusTag";
import type { StepItem } from "../../ui/Steps";

type ImportCopy = Copy["importCopy"];

/** The data's "pending" step is the Steps component's "upcoming". */
const STEP_STATE: Record<ImportStep["state"], StepItem["state"]> = { done: "done", current: "current", pending: "upcoming" };

/** The dot beside each field check. */
export const CHECK_TONE: Record<FieldMapping["check"], StatusTone> = { ok: "registered", warning: "warning", error: "warning" };

function isToday(date: Date): boolean {
  return isoDay(date) === isoDay(now());
}

export function selectedBoards(run: ImportRun): number {
  return run.boards.filter((board) => board.selected).length;
}

/** When the import finished: "היום ב-08:40" on desktop, "היום 08:40" on phones, and older days as the dashboard writes them. */
function finishedText(at: string, copy: ImportCopy, locale: Locale, phone: boolean): string {
  const date = new Date(at);
  if (!phone && isToday(date)) return copy.steps.notes.todayAt(formatTime(date));
  return formatRelative(date, now(), locale);
}

/** The small note at the end of a finished step, like "4 לוחות" or "37 אוחדו". */
function stepNote(step: ImportStep, run: ImportRun, copy: ImportCopy, locale: Locale, phone: boolean): string | undefined {
  if (step.state !== "done") return undefined;
  const notes = copy.steps.notes;
  switch (step.key) {
    case "connect":
      return phone ? notes.connectedPhone : notes.connected;
    case "boards":
      return notes.boards(selectedBoards(run));
    case "fields":
      return notes.fields(run.fields.length);
    case "duplicates":
      return phone ? notes.byPhone : notes.merged(run.totals.duplicatesMerged);
    case "import":
      return step.completedAt ? finishedText(step.completedAt, copy, locale, phone) : undefined;
  }
}

/** The import's five steps, ready for the Steps component. */
export function stepItems(run: ImportRun, copy: ImportCopy, locale: Locale, phone: boolean): StepItem[] {
  return run.steps.map((step) => ({
    key: step.key,
    label: copy.steps.labels[step.key],
    note: stepNote(step, run, copy, locale, phone),
    state: STEP_STATE[step.state],
  }));
}

/** "הלוחות ב-Monday.com נסגרו היום ב-15:30." */
export function closedText(closedAt: string | null, copy: ImportCopy, locale: Locale): string {
  const date = closedAt ? new Date(closedAt) : now();
  return isToday(date) ? copy.monday.closedToday(formatTime(date)) : copy.monday.closedOn(formatDate(date, locale));
}
