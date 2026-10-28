import type { Locale } from "../../content/copy";
import {
  CAMPAIGN_STAGES,
  type AudienceOption,
  type BirthdayEntry,
  type CampaignStage,
  type CampaignStatus,
  type DeliveryStatus,
  type HolidayCampaign,
  type ShabbatRule,
} from "../../data/types";
import { isoDay } from "../../lib/clock";
import { toHebrewNumeral } from "../../lib/hebrew";
import type { StatusTone } from "../../ui/StatusTag";
import type { StepItem } from "../../ui/Steps";

/** Grid spans: two columns from lg, the boards' twelve-column layout from xl (1280px), where every card has room. */
export const SPAN = {
  third: "lg:col-span-6 xl:col-span-4",
  holidayPreview: "lg:col-span-5 xl:col-span-4",
  send: "lg:col-span-7",
  lastCampaign: "lg:col-span-12 xl:col-span-5",
  full: "lg:col-span-12",
  template: "lg:col-span-6 xl:col-span-5",
  birthdayPreview: "lg:col-span-6 xl:col-span-3",
} as const;

/** Holds a headline's second line while its text loads, so nothing below it jumps. */
export const KEEP_LINE = " ";

/** Same tones as the overview's greeting card. */
export const CAMPAIGN_TONE: Record<CampaignStatus, StatusTone> = {
  draft: "neutral",
  "awaiting-approval": "new",
  scheduled: "registered",
  sending: "talking",
  completed: "registered",
};

/** As on the boards: read green, delivered taupe, failed red, waiting gold. */
export const DELIVERY_TONE: Record<DeliveryStatus, StatusTone> = {
  "awaiting-approval": "new",
  scheduled: "new",
  paused: "irrelevant",
  sent: "sent",
  delivered: "sent",
  read: "registered",
  failed: "warning",
};

/** A greeting with one of these statuses has gone out. */
export const WENT_OUT: ReadonlySet<DeliveryStatus> = new Set<DeliveryStatus>(["sent", "delivered", "read"]);

/** The Shabbat rule's choices, in the order the menu lists them. */
export const SHABBAT_RULES: readonly ShabbatRule[] = ["after-shabbat", "before-shabbat"];

/** WhatsApp takes up to 4,096 characters in one message. */
const WHATSAPP_LIMIT = 4096;

export function messageCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / WHATSAPP_LIMIT));
}

/** 5787 is written תשפ״ז in Hebrew and 5787 in English. */
export function hebrewYearLabel(year: number, locale: Locale): string {
  return locale === "he" ? toHebrewNumeral(year % 1000) : String(year);
}

/** The greeting still waits for Ronit's approval. */
export function awaitsApproval(campaign: HolidayCampaign): boolean {
  return campaign.status === "draft" || campaign.status === "awaiting-approval";
}

/** The text and the audience can change until sending starts. */
export function isEditable(campaign: HolidayCampaign): boolean {
  return campaign.status !== "sending" && campaign.status !== "completed";
}

/** Where the greeting is among the four stages, from 0. */
export function stageIndex(campaign: HolidayCampaign): number {
  return Math.max(0, CAMPAIGN_STAGES.indexOf(campaign.stage));
}

/** The four stages as steps: earlier ones done, the greeting's own stage current. */
export function stageSteps(campaign: HolidayCampaign, labels: Record<CampaignStage, string>): StepItem[] {
  const current = stageIndex(campaign);
  return CAMPAIGN_STAGES.map((stage, index) => ({
    key: stage,
    label: labels[stage],
    state: index < current ? "done" : index === current ? "current" : "upcoming",
  }));
}

/** Orb sizes and places (px from the inline end and from the top), as on the boards. */
export const HOLIDAY_ORB = {
  desktop: { size: 230, end: 92, top: 74 },
  phone: { size: 180, end: 88, top: 40 },
} as const;

export const BIRTHDAY_ORB = {
  desktop: { size: 220, end: 70, top: 72 },
  phone: { size: 170, end: 92, top: 40 },
} as const;

/** The audience as Ronit names it. The screen names "all"; phones take the short name. */
export function audienceName(audience: AudienceOption | undefined, allLabel: string, short = false): string {
  if (!audience) return "";
  if (audience.kind === "all") return allLabel;
  return (short ? (audience.shortName ?? audience.name) : audience.name) ?? "";
}

/** The code a service failed with, like "empty-message". */
export function errorCode(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export function fullName(person: Pick<BirthdayEntry, "firstName" | "lastName">): string {
  return `${person.firstName} ${person.lastName}`;
}

/** Where a Shabbat birthday's greeting went: on the birthday after Shabbat ends, or on the Friday before. */
export function shabbatRuleOf(entry: BirthdayEntry): ShabbatRule {
  return isoDay(new Date(entry.sendAt)) === entry.day ? "after-shabbat" : "before-shabbat";
}

export type TodayState = "none" | "all-sent" | "paused" | "pending" | "some-sent";

/** How today's birthday greetings stand, for the line on the orb card. */
export function todayState(entries: BirthdayEntry[]): TodayState {
  if (entries.length === 0) return "none";
  const out = entries.filter((entry) => WENT_OUT.has(entry.status)).length;
  if (out === entries.length) return "all-sent";
  if (entries.some((entry) => entry.status === "paused")) return "paused";
  if (out === 0 && !entries.some((entry) => entry.status === "failed")) return "pending";
  return "some-sent";
}

export function sentCount(entries: BirthdayEntry[]): number {
  return entries.filter((entry) => WENT_OUT.has(entry.status)).length;
}
