import type { Lead, LeadService, LeadStatus } from "../../data/types";
import type { StatusTone } from "../../ui/StatusTag";

/** The pipeline in order: the board's columns. */
export const STATUS_ORDER: readonly LeadStatus[] = ["new", "no-answer", "talking", "details-sent", "registered", "not-relevant"];

/** Each status's dot on a StatusTag. */
export const STATUS_TONE: Record<LeadStatus, StatusTone> = {
  new: "new",
  "no-answer": "warning",
  talking: "talking",
  "details-sent": "sent",
  registered: "registered",
  "not-relevant": "irrelevant",
};

/** The same dots as plain spans, for the board's column headings. */
export const STATUS_DOT: Record<LeadStatus, string> = {
  new: "bg-status-new",
  "no-answer": "bg-status-warning",
  talking: "bg-status-talking",
  "details-sent": "bg-status-sent",
  registered: "bg-status-registered",
  "not-relevant": "bg-status-irrelevant",
};

/** Leads of one service. `service` is null for leads that didn't say. */
export interface ServiceLeads {
  key: string;
  service: LeadService | null;
  leads: Lead[];
}

const SERVICE_ORDER: ReadonlyArray<LeadService | null> = ["uman", "challah", null];

/** Leads grouped by what they asked about (Monday doesn't say which trip): Uman, then challah, then the rest. */
export function groupByService(leads: Lead[]): ServiceLeads[] {
  return SERVICE_ORDER.map((service) => ({ key: service ?? "none", service, leads: leads.filter((lead) => lead.service === service) })).filter(
    (group) => group.leads.length > 0,
  );
}

/** The letter in a person's avatar: "י" for יעל פרץ. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "";
}

/** Staff are named by first name on these screens, as on the board: "רונית", "מורן". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "0542212219" becomes "972542212219". */
function internationalNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
}

export const whatsappHref = (phone: string): string => `https://wa.me/${internationalNumber(phone)}`;
export const telHref = (phone: string): string => `tel:+${internationalNumber(phone)}`;

/** After the side panel closes, focus goes back to the lead's link in the table or on the board. */
export function focusLeadLink(id: string): void {
  window.requestAnimationFrame(() => {
    const path = `/leads/${encodeURIComponent(id)}`;
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("main a[href]"));
    links.find((link) => link.pathname === path)?.focus();
  });
}
