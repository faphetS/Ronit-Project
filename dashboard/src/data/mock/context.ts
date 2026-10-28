import type { ServiceName } from "../services";
import type { AuditEntry, Customer, Database } from "../types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An audit entry before it gets its id, time and author. */
export type AuditInput = DistributiveOmit<AuditEntry, "id" | "at" | "byUserId">;

/** What the mock services share. */
export interface MockContext {
  /** The in-memory store. Services change it in place. */
  state: Database;
  /** Waits like a network call, fails when the service is switched off, and never hands out internal objects. */
  respond<T>(service: ServiceName, produce: () => T): Promise<T>;
  clock(): Date;
  /** The signed-in user. With nobody signed in the mock acts as Ronit, the user every sign-in gets. */
  actingUserId(): string;
  /** Adds a sensitive action by the acting user, now. */
  logAudit<E extends AuditInput>(entry: E): AuditEntry & E;
}

export function fullName(customer: Pick<Customer, "firstName" | "lastName">): string {
  return `${customer.firstName} ${customer.lastName}`;
}

/** For sort(): the latest `at` first. Equal times keep their order. */
export function newestFirst(a: { at: string }, b: { at: string }): number {
  return b.at.localeCompare(a.at);
}

/**
 * An append-only log, newest first. The demo clock stands still, so actions taken in one session share a time;
 * among equal times the one added later comes first.
 */
export function latestFirst<T extends { at: string }>(log: readonly T[]): T[] {
  return [...log].reverse().sort(newestFirst);
}
