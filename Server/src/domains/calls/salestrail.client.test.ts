import { describe, it, expect, vi, beforeEach } from "vitest";

// Two Salestrail orgs push to our single webhook, but each org has its own Pull
// API key. A recording lives in exactly one org; the other org answers 404.
vi.mock("../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    SALESTRAIL_API_USERNAME: "org1-user",
    SALESTRAIL_API_PASSWORD: "org1-pass",
    SALESTRAIL_API_USERNAME_2: "org2-user",
    SALESTRAIL_API_PASSWORD_2: "org2-pass",
  },
}));

import { salestrailClient } from "./salestrail.client.js";

const RECORDING_URL = "https://standalone-api.salestrail.io/export/calls/abc-123/recording";

function authOf(call: unknown[]): string {
  const init = call[1] as { headers: Record<string, string> };
  return Buffer.from(init.headers.Authorization.replace("Basic ", ""), "base64").toString("utf8");
}

function audioResponse(bytes: number): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "application/octet-stream" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("tryDownloadOnce — multi-org Pull API credentials", () => {
  it("returns the recording when the first org owns it, without trying the second", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(audioResponse(64));

    const result = await salestrailClient.tryDownloadOnce("abc-123");

    expect(result).toEqual({ status: "ok", buffer: Buffer.alloc(64), org: "org1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBe("org1-user:org1-pass");
  });

  it("falls through to the second org when the first answers 404", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(audioResponse(32));

    const result = await salestrailClient.tryDownloadOnce("abc-123");

    expect(result).toMatchObject({ status: "ok", org: "org2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(RECORDING_URL);
    expect(authOf(fetchMock.mock.calls[1])).toBe("org2-user:org2-pass");
  });

  it("reports not_ready only after every org has answered 404", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 404 }));

    const result = await salestrailClient.tryDownloadOnce("abc-123");

    expect(result).toEqual({ status: "not_ready" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an empty body as not owned and keeps trying the next org", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(audioResponse(0))
      .mockResolvedValueOnce(audioResponse(16));

    const result = await salestrailClient.tryDownloadOnce("abc-123");

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a non-404 failure rather than masking it as not_ready", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("nope", { status: 401, statusText: "Unauthorized" }),
    );

    const result = await salestrailClient.tryDownloadOnce("abc-123");

    expect(result.status).toBe("error");
    expect(result).toMatchObject({ message: expect.stringContaining("401") });
  });
});
