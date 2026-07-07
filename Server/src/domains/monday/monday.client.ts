import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";

const MONDAY_URL = "https://api.monday.com/v2";
const API_VERSION = "2025-04";

// 1s then 3s between network-error / 5xx retries; the last entry repeats for
// any further configured retries.
const TRANSIENT_RETRY_DELAYS_MS = [1000, 3000];

interface GqlResponse<T> {
  data?: T;
  errors?: unknown;
}

export type RateLimitKind = "daily" | "minute";

export class MondayRateLimitError extends AppError {
  constructor(
    public kind: RateLimitKind,
    public retryInSeconds: number,
    detail: string,
  ) {
    super(
      503,
      `Monday rate limited (${kind}, retry in ${retryInSeconds}s): ${detail}`,
      "MONDAY_RATE_LIMITED",
    );
    this.name = "MondayRateLimitError";
  }
}

interface MondayGqlErrorExtensions {
  code?: string;
  retry_in_seconds?: number;
}

interface MondayGqlError {
  message?: string;
  extensions?: MondayGqlErrorExtensions;
}

const MINUTE_LIMIT_CODES = new Set([
  "ComplexityException",
  "COMPLEXITY_BUDGET_EXHAUSTED",
  "RATE_LIMIT_EXCEEDED",
  "minuteRateLimitExceeded",
]);

// A deterministic per-query complexity CEILING (this query's shape always costs
// more than Monday allows) is not a rate limit — retrying it for 7 days in the
// queue would never succeed. Only budget EXHAUSTION (which resets over time,
// message carries "reset in"/"retry in" wording) is a real minute-limit.
const COMPLEXITY_CEILING_CODE = "maxComplexityExceeded";
const COMPLEXITY_CEILING_MESSAGE = /exceeds max(?:imum)? complexity/i;

function extractRetrySeconds(message: string): number | null {
  const match = /(?:retry|reset)[^\d]*?(\d+)\s*second/i.exec(message);
  return match ? Number(match[1]) : null;
}

/** Walks a Monday GraphQL `errors` array (narrow, no `any`) and classifies a
 *  rate-limit condition, if present. Returns null for any other GraphQL error,
 *  including a deterministic complexity-ceiling error (caller falls through to
 *  the existing plain-error AppError so it fails fast). */
export function classifyRateLimit(
  errors: unknown,
): { kind: RateLimitKind; retryInSeconds: number } | null {
  if (!Array.isArray(errors)) return null;

  for (const raw of errors) {
    if (typeof raw !== "object" || raw === null) continue;
    const err = raw as MondayGqlError;
    const code = err.extensions?.code;
    const message = err.message ?? "";

    if (code === "DAILY_LIMIT_EXCEEDED" || /daily limit/i.test(message)) {
      const retryInSeconds =
        err.extensions?.retry_in_seconds ?? extractRetrySeconds(message) ?? 3600;
      return { kind: "daily", retryInSeconds };
    }

    if (code === COMPLEXITY_CEILING_CODE || COMPLEXITY_CEILING_MESSAGE.test(message)) {
      continue;
    }

    if (
      (code && MINUTE_LIMIT_CODES.has(code)) ||
      /complexity|rate limit/i.test(message)
    ) {
      const retryInSeconds =
        err.extensions?.retry_in_seconds ?? extractRetrySeconds(message) ?? 60;
      return { kind: "minute", retryInSeconds };
    }
  }

  return null;
}

function classifyHttp429(
  body: string,
  retryAfterHeader: string | null,
): { kind: RateLimitKind; retryInSeconds: number } {
  try {
    const parsed = JSON.parse(body) as { errors?: unknown };
    const fromErrors = classifyRateLimit(parsed.errors);
    if (fromErrors) return fromErrors;
  } catch {
    // body wasn't JSON — fall through to plain-text heuristics
  }

  if (/DAILY_LIMIT/i.test(body) || /daily limit/i.test(body)) {
    return { kind: "daily", retryInSeconds: 3600 };
  }

  const headerSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  return {
    kind: "minute",
    retryInSeconds: Number.isFinite(headerSeconds) && headerSeconds > 0 ? headerSeconds : 60,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transientDelayMs(attempt: number): number {
  return TRANSIENT_RETRY_DELAYS_MS[attempt - 1] ?? TRANSIENT_RETRY_DELAYS_MS.at(-1)!;
}

// Circuit breaker: once a rate limit is confirmed (daily, or a minute limit
// that outlasted the one inline sleep below), every caller fails fast until
// it resets — instead of every concurrent webhook stacking its own sleep/retry
// on top of an API that's already known to be exhausted.
let rateLimitedUntilMs = 0;
let rateLimitedKind: RateLimitKind = "minute";

export function resetMondayRateLimitState(): void {
  rateLimitedUntilMs = 0;
}

function tripRateLimitBreaker(kind: RateLimitKind, retryInSeconds: number): void {
  rateLimitedUntilMs = Date.now() + retryInSeconds * 1000;
  rateLimitedKind = kind;
}

type RateLimitDecision = { action: "sleep"; sleepMs: number } | { action: "throw" };

// Single home for "sleep inline once, or give up" — shared by the HTTP-429
// branch and the GraphQL-errors-in-a-200 branch so the policy can't drift
// between the two call sites.
function decideRateLimitAction(
  rateLimit: { kind: RateLimitKind; retryInSeconds: number },
  sleepAlreadyUsed: boolean,
): RateLimitDecision {
  if (rateLimit.kind === "daily") return { action: "throw" };
  const sleepMs = rateLimit.retryInSeconds * 1000;
  if (!sleepAlreadyUsed && sleepMs <= env.MONDAY_INLINE_RETRY_MAX_WAIT_MS) {
    return { action: "sleep", sleepMs };
  }
  return { action: "throw" };
}

export async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  if (!env.MONDAY_API_TOKEN) {
    throw new AppError(
      503,
      "Monday not configured — MONDAY_API_TOKEN missing",
      "MONDAY_NOT_CONFIGURED",
    );
  }

  if (Date.now() < rateLimitedUntilMs) {
    const remainingSeconds = Math.max(1, Math.ceil((rateLimitedUntilMs - Date.now()) / 1000));
    throw new MondayRateLimitError(
      rateLimitedKind,
      remainingSeconds,
      "circuit breaker open — Monday still rate limited",
    );
  }

  const maxAttempts = 1 + env.MONDAY_GQL_MAX_RETRIES;
  let networkAttempt = 0;
  let rateLimitSleepUsed = false;

  for (;;) {
    networkAttempt++;

    let res: Response;
    try {
      res = await fetch(MONDAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: env.MONDAY_API_TOKEN,
          "API-Version": API_VERSION,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (networkAttempt < maxAttempts) {
        logger.warn({ attempt: networkAttempt, err }, "Monday gql network error — retrying");
        await sleep(transientDelayMs(networkAttempt));
        continue;
      }
      throw err;
    }

    if (res.status === 429) {
      const body = await res.text();
      const rateLimit = classifyHttp429(body, res.headers.get("Retry-After"));
      const decision = decideRateLimitAction(rateLimit, rateLimitSleepUsed);

      if (decision.action === "sleep") {
        rateLimitSleepUsed = true;
        logger.warn(
          { kind: rateLimit.kind, retryInSeconds: rateLimit.retryInSeconds },
          "Monday gql rate limited — retrying inline",
        );
        await sleep(decision.sleepMs);
        continue;
      }

      tripRateLimitBreaker(rateLimit.kind, rateLimit.retryInSeconds);
      throw new MondayRateLimitError(rateLimit.kind, rateLimit.retryInSeconds, body.slice(0, 300));
    }

    if (!res.ok) {
      if (res.status >= 500 && networkAttempt < maxAttempts) {
        logger.warn({ attempt: networkAttempt, status: res.status }, "Monday gql HTTP 5xx — retrying");
        await sleep(transientDelayMs(networkAttempt));
        continue;
      }
      const body = await res.text();
      throw new AppError(
        502,
        `Monday HTTP ${res.status}: ${body.slice(0, 300)}`,
        "MONDAY_HTTP_ERROR",
      );
    }

    const json = (await res.json()) as GqlResponse<T>;

    if (json.errors) {
      const rateLimit = classifyRateLimit(json.errors);

      if (rateLimit) {
        const detail = JSON.stringify(json.errors).slice(0, 400);
        const decision = decideRateLimitAction(rateLimit, rateLimitSleepUsed);

        if (decision.action === "sleep") {
          rateLimitSleepUsed = true;
          logger.warn(
            { kind: rateLimit.kind, retryInSeconds: rateLimit.retryInSeconds },
            "Monday gql rate limited — retrying inline",
          );
          await sleep(decision.sleepMs);
          continue;
        }

        tripRateLimitBreaker(rateLimit.kind, rateLimit.retryInSeconds);
        throw new MondayRateLimitError(rateLimit.kind, rateLimit.retryInSeconds, detail);
      }

      throw new AppError(
        502,
        `Monday GraphQL error: ${JSON.stringify(json.errors).slice(0, 400)}`,
        "MONDAY_GRAPHQL_ERROR",
      );
    }

    if (!json.data) {
      throw new AppError(502, "Monday returned no data", "MONDAY_NO_DATA");
    }

    rateLimitedUntilMs = 0;
    return json.data;
  }
}
