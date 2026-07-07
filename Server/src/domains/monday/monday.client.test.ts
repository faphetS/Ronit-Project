import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gql, classifyRateLimit, resetMondayRateLimitState } from "./monday.client.js";

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  resetMondayRateLimitState();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetMondayRateLimitState();
});

describe("classifyRateLimit", () => {
  it("returns null for non-array input", () => {
    expect(classifyRateLimit(undefined)).toBeNull();
    expect(classifyRateLimit("oops")).toBeNull();
  });

  it("classifies DAILY_LIMIT_EXCEEDED as daily, using extensions.retry_in_seconds", () => {
    const result = classifyRateLimit([
      {
        message: "Daily limit exceeded",
        extensions: { code: "DAILY_LIMIT_EXCEEDED", retry_in_seconds: 9000 },
      },
    ]);
    expect(result).toEqual({ kind: "daily", retryInSeconds: 9000 });
  });

  it("classifies ComplexityException as minute with default 60s", () => {
    const result = classifyRateLimit([
      { message: "budget exhausted", extensions: { code: "ComplexityException" } },
    ]);
    expect(result).toEqual({ kind: "minute", retryInSeconds: 60 });
  });

  it("returns null for a plain GraphQL error", () => {
    expect(classifyRateLimit([{ message: "Some other error" }])).toBeNull();
  });

  it("extractRetrySeconds also matches 'reset in N seconds' wording", () => {
    const result = classifyRateLimit([
      {
        message: "Complexity budget exhausted, will reset in 45 seconds",
        extensions: { code: "ComplexityException" },
      },
    ]);
    expect(result).toEqual({ kind: "minute", retryInSeconds: 45 });
  });

  it("a deterministic per-query complexity CEILING (code) is NOT a rate limit", () => {
    const result = classifyRateLimit([
      {
        message: "Query exceeds maximum complexity of 5000000",
        extensions: { code: "maxComplexityExceeded" },
      },
    ]);
    expect(result).toBeNull();
  });

  it("a deterministic per-query complexity CEILING (message only, no code) is NOT a rate limit", () => {
    const result = classifyRateLimit([{ message: "This query exceeds max complexity allowed" }]);
    expect(result).toBeNull();
  });

  it("a budget-EXHAUSTION complexity error (has 'reset in') stays kind:minute", () => {
    const result = classifyRateLimit([
      {
        message: "Complexity budget exhausted, reset in 30 seconds",
        extensions: { code: "ComplexityException" },
      },
    ]);
    expect(result).toEqual({ kind: "minute", retryInSeconds: 30 });
  });
});

describe("gql — retry / rate-limit behavior", () => {
  it("daily-limit GraphQL error → MondayRateLimitError(daily), exactly 1 fetch (never waits)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        errors: [
          {
            message: "Daily limit exceeded",
            extensions: { code: "DAILY_LIMIT_EXCEEDED", retry_in_seconds: 9000 },
          },
        ],
      }),
    );

    await expect(gql("query {}")).rejects.toMatchObject({
      name: "MondayRateLimitError",
      kind: "daily",
      retryInSeconds: 9000,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("HTTP 429 + Retry-After 3 → retried inline, succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "3" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    const promise = gql("query {}");
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("plain-text HTTP 429 body 'daily limit' (no underscore) is classified as daily", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => "You have hit your daily limit for this account",
      json: async () => ({}),
    });

    await expect(gql("query {}")).rejects.toMatchObject({ kind: "daily" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("minute error above the inline wait cap → thrown without sleeping", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        errors: [
          {
            message: "rate limit exceeded",
            extensions: { code: "RATE_LIMIT_EXCEEDED", retry_in_seconds: 100 },
          },
        ],
      }),
    );

    await expect(gql("query {}")).rejects.toMatchObject({
      name: "MondayRateLimitError",
      kind: "minute",
      retryInSeconds: 100,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("network reject then success → retries once (1s delay) and resolves", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    const promise = gql("query {}");
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("plain GraphQL error → existing AppError unchanged, exactly 1 fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { errors: [{ message: "Some other error" }] }),
    );

    await expect(gql("query {}")).rejects.toMatchObject({
      code: "MONDAY_GRAPHQL_ERROR",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("complexity-ceiling GraphQL error falls through to MONDAY_GRAPHQL_ERROR (fails fast, not queued as a rate limit)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        errors: [
          {
            message: "Query exceeds maximum complexity of 5000000",
            extensions: { code: "maxComplexityExceeded" },
          },
        ],
      }),
    );

    await expect(gql("query {}")).rejects.toMatchObject({ code: "MONDAY_GRAPHQL_ERROR" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries exhausted (repeated network errors) → last error thrown", async () => {
    vi.useFakeTimers();
    const finalError = new Error("still down");
    // MONDAY_GQL_MAX_RETRIES defaults to 2 → 3 total attempts.
    fetchMock
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(finalError);

    const promise = gql("query {}");
    const assertion = expect(promise).rejects.toBe(finalError);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("gql — circuit breaker (F8)", () => {
  it("a thrown rate limit trips the breaker — the next call fails fast with NO fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        errors: [
          { message: "Daily limit exceeded", extensions: { code: "DAILY_LIMIT_EXCEEDED", retry_in_seconds: 9000 } },
        ],
      }),
    );

    await expect(gql("query {}")).rejects.toMatchObject({ kind: "daily" });
    expect(fetchMock).toHaveBeenCalledOnce();

    await expect(gql("query {}")).rejects.toMatchObject({ kind: "daily" });
    expect(fetchMock).toHaveBeenCalledOnce(); // still 1 — second call never fetched
  });

  it("resetMondayRateLimitState() clears the breaker immediately", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        errors: [
          { message: "Daily limit exceeded", extensions: { code: "DAILY_LIMIT_EXCEEDED", retry_in_seconds: 9000 } },
        ],
      }),
    );
    await expect(gql("query {}")).rejects.toMatchObject({ kind: "daily" });
    expect(fetchMock).toHaveBeenCalledOnce();

    resetMondayRateLimitState();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    const result = await gql("query {}");
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("at most ONE inline sleep per gql call — a second consecutive minute limit trips the breaker instead of sleeping again", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "3" }))
      .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "3" }));

    const promise = gql("query {}");
    const assertion = expect(promise).rejects.toMatchObject({ kind: "minute" });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;

    // Exactly 2 fetches: the original + the one retry after the single sleep.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Breaker is now open — a third call must not fetch at all.
    await expect(gql("query {}")).rejects.toMatchObject({ kind: "minute" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
