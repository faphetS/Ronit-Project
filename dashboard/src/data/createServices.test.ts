import { afterEach, describe, expect, it, vi } from "vitest";
import { createServices, httpServicesFromEnv } from "./createServices";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("httpServicesFromEnv", () => {
  it("reads a list, 'all', or nothing", () => {
    expect([...httpServicesFromEnv("session, customers,nonsense")]).toEqual(["session", "customers"]);
    expect(httpServicesFromEnv("all").size).toBe(9);
    expect(httpServicesFromEnv(undefined).size).toBe(0);
    expect(httpServicesFromEnv("").size).toBe(0);
  });
});

describe("createServices", () => {
  it("moves only the services that have an API adapter", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ status: "error", code: "UNAUTHENTICATED" }), { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const services = createServices({ http: new Set(["session", "leads"]), apiUrl: "https://api.example.com", mock: { latency: [0, 0], storage: window.sessionStorage } });

    await expect(services.session.current()).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledWith("https://api.example.com/api/auth/session", expect.objectContaining({ credentials: "include" }));
    // Leads has no adapter yet, so it still answers from the demo data.
    await expect(services.leads.counts()).resolves.toMatchObject({ all: expect.any(Number) });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
