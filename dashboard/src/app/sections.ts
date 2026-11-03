import type { IconName } from "../ui/icons";

export type DesktopNavKey = "overview" | "leads" | "customers" | "groups" | "holidays" | "birthdays";

export const DESKTOP_NAV: Array<{ key: DesktopNavKey; to: string; end?: boolean; icon: IconName }> = [
  { key: "overview", to: "/", end: true, icon: "home" },
  { key: "leads", to: "/leads", icon: "leads" },
  { key: "customers", to: "/customers", icon: "customers" },
  { key: "groups", to: "/groups", icon: "groups" },
  { key: "holidays", to: "/greetings/holidays", icon: "greetings" },
  { key: "birthdays", to: "/greetings/birthdays", icon: "cake" },
];

export type RailKey = DesktopNavKey | "settings";

const RAIL_ORDER: readonly RailKey[] = [...DESKTOP_NAV.map((item) => item.key), "settings"];

/** The rail item to mark: the section that owns the path, or settings for users and the import. */
export function railKeyFor(pathname: string): RailKey | null {
  const section = DESKTOP_NAV.find((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)));
  if (section) return section.key;
  if (pathname === "/users" || pathname === "/import") return "settings";
  return null;
}

/** A desktop page's place in the rail, top to bottom, or -1 off it: a page change slides the way the rail moved. */
export function railIndexFor(pathname: string): number {
  const key = railKeyFor(pathname);
  return key ? RAIL_ORDER.indexOf(key) : -1;
}

export type PhoneTabKey = "home" | "leads" | "customers" | "groups" | "greetings";

export const PHONE_TABS: Array<{ key: PhoneTabKey; to: string; icon: IconName }> = [
  { key: "home", to: "/", icon: "home" },
  { key: "leads", to: "/leads", icon: "leads" },
  { key: "customers", to: "/customers", icon: "customers" },
  { key: "groups", to: "/groups", icon: "groups" },
  { key: "greetings", to: "/greetings/holidays", icon: "greetings" },
];

/** Phone screens that slide over the one below: details, the account screen and the import. */
export function isPushedRoute(pathname: string): boolean {
  return /^\/(leads|customers)\/[^/]+$/.test(pathname) || pathname === "/users" || pathname === "/import";
}

/** Where a pushed screen goes back to when there is no history to pop. */
export function parentOf(pathname: string): string {
  if (pathname.startsWith("/leads/")) return "/leads";
  if (pathname.startsWith("/customers/")) return "/customers";
  if (pathname === "/import") return "/users";
  return "/";
}

/** The phone tab that owns a path. The account screen and the import live under home. */
export function phoneTabFor(pathname: string): PhoneTabKey {
  const first = pathname.split("/")[1] ?? "";
  if (first === "leads" || first === "customers" || first === "groups") return first;
  if (first === "greetings") return "greetings";
  return "home";
}

/** Desktop pages: the lead panel and the selected group stay on their list page, without a page change. */
export function desktopPageKey(pathname: string): string {
  if (pathname.startsWith("/leads")) return "/leads";
  if (pathname.startsWith("/groups")) return "/groups";
  return pathname;
}
