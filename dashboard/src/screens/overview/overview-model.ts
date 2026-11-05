import { useEffect, useState } from "react";
import type { Copy, Locale } from "../../content/copy";
import type {
  ActivityKind,
  CampaignStatus,
  GroupSummary,
  IntakeResult,
  Lead,
  LeadSource,
  LeadStatus,
  WeeklyCount,
} from "../../data/types";
import { dayAt, isoDay, now, today } from "../../lib/clock";
import { formatDate, formatDayMonth, formatNumber, formatRelative, formatTime } from "../../lib/format";
import type { IconName } from "../../ui/icons";
import type { StatusTone } from "../../ui/StatusTag";
import type { WeekBar } from "../../ui/WeekBars";

type OverviewCopy = Copy["overview"];

/** How many rows each list shows, as on the boards. */
export const SHOWN = {
  leads: 5,
  groups: 3,
  passports: 3,
  activity: { desktop: 5, phone: 3 },
} as const;

export const LEAD_TONE: Record<LeadStatus, StatusTone> = {
  new: "new",
  "no-answer": "warning",
  talking: "talking",
  "details-sent": "sent",
  registered: "registered",
  "not-relevant": "irrelevant",
};

export const INTAKE_TONE: Record<IntakeResult, StatusTone> = {
  matched: "registered",
  "new-card": "sent",
  "needs-review": "warning",
};

export const CAMPAIGN_TONE: Record<CampaignStatus, StatusTone> = {
  draft: "neutral",
  "in-review": "talking",
  "awaiting-approval": "new",
  scheduled: "registered",
  sending: "talking",
  completed: "registered",
};

export const ACTIVITY_ICON: Record<ActivityKind, IconName> = {
  lead: "leads",
  registration: "groups",
  passport: "customers",
  import: "import",
};

/** The first letter of a name, for its avatar. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "";
}

/** Whether a moment falls on today, in Israel. */
export function isToday(iso: string): boolean {
  return isoDay(new Date(iso)) === isoDay(now());
}

/** A clock time for today ("14:32"), otherwise "אתמול" or the date. */
export function timeOfDay(iso: string, locale: Locale): string {
  const at = new Date(iso);
  return isToday(iso) ? formatTime(at) : formatRelative(at, now(), locale);
}

/** A message on one line, for a short excerpt. */
export function oneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").trim();
}

/** "06.09" becomes "6.9" ("06/09" becomes "6/9" in English), as the chart's axis writes weeks. */
function shortDayMonth(date: Date, locale: Locale): string {
  return formatDayMonth(date, locale).replace(/(^|\D)0(\d)/g, "$1$2");
}

/** The weekly series as chart bars: each week's start date under its bar, and "השבוע" under the last. */
export function weekBars(weeks: readonly WeeklyCount[], locale: Locale, thisWeek: string): WeekBar[] {
  return weeks.map((week, index) => ({
    key: week.weekStart,
    label: index === weeks.length - 1 ? thisWeek : shortDayMonth(dayAt(week.weekStart), locale),
    value: week.count,
  }));
}

/** Groups that have not ended (and trips without a date yet), by start date as the service lists them. */
export function activeGroups(groups: readonly GroupSummary[]): GroupSummary[] {
  const day = isoDay(today());
  return groups.filter((group) => {
    const last = group.endsOn ?? group.startsOn;
    return last === null || last >= day;
  });
}

/** "טיסה · נשים בלבד · אוגוסט 2027" or "אירוע · 03.12.2026". `short` is the phone card: no "women only", no year. */
export function groupCaption(group: GroupSummary, copy: OverviewCopy["groups"], locale: Locale, short: boolean): string {
  const parts: string[] = [group.type === "flight" ? copy.flight : copy.event];
  if (group.womenOnly && !short) parts.push(copy.womenOnly);
  if (group.dateLabel) {
    parts.push(group.dateLabel);
  } else if (!group.startsOn) {
    parts.push(copy.noDate);
  } else {
    const start = dayAt(group.startsOn);
    const date = short ? formatDayMonth(start, locale) : formatDate(start, locale);
    parts.push(group.type === "flight" ? copy.departs(date) : date);
  }
  return parts.join(" · ");
}

export function registeredShare(group: GroupSummary): number {
  return group.capacity ? group.registered / group.capacity : 0;
}

/** "12 מתוך 45 נרשמו", or "12 נרשמו" without a capacity. */
export function registeredLine(group: GroupSummary, copy: OverviewCopy["groups"]): string {
  const registered = formatNumber(group.registered);
  return group.capacity === null ? copy.registeredCount(registered) : copy.registered(registered, formatNumber(group.capacity));
}

/**
 * The orb card's lines about today's leads: how many came in, how many from each source (most first), and how many
 * are still new, with nobody in touch yet. No sources or waiting line on a day without leads.
 */
export function todaysLeadLines(leads: readonly Lead[], copy: OverviewCopy): { title: string; sources: string | null; waiting: string | null } {
  const title = copy.leadsToday(leads.length);
  if (leads.length === 0) return { title, sources: null, waiting: null };
  const sources = (Object.keys(copy.sources) as LeadSource[])
    .map((source) => ({ source, count: leads.filter((lead) => lead.source === source).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((entry) => copy.sourceCount(copy.sources[entry.source], entry.count))
    .join(" · ");
  return { title, sources, waiting: copy.leadsWaiting(leads.filter((lead) => lead.status === "new").length) };
}

const RECHECK_MS = 15_000;

/**
 * Whole minutes since `since`, a timestamp such as a query's dataUpdatedAt: how fresh the numbers on screen are.
 * Rechecked every 15 seconds.
 */
export function useMinutesSince(since: number): number {
  const [checkedAt, setCheckedAt] = useState(since);
  useEffect(() => {
    const check = () => setCheckedAt(Date.now());
    const first = window.setTimeout(check, 0);
    const timer = window.setInterval(check, RECHECK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [since]);
  return Math.max(0, Math.floor((checkedAt - since) / 60_000));
}
