import { describe, expect, it, vi } from "vitest";
import { createServices } from "./createServices";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const DEMO = {
  session: { userId: "d1", signedInAt: "2026-11-17T10:00:00.000Z" },
  user: { id: "d1", name: "חשבון הדגמה", initial: "ח", role: "admin", passportAccess: true, demo: true },
};

describe("createServices", () => {
  it("runs on sample data while a demo account is signed in, and on the API again after it signs out", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const services = createServices({ apiUrl: "https://api.example.com", fetch });

    fetch.mockResolvedValueOnce(json(200, { status: "ok", ...DEMO }));
    expect(await services.session.current()).toMatchObject({ user: { demo: true } });
    expect((await services.leads.list()).length).toBeGreaterThan(0);
    expect((await services.customers.list()).items.length).toBeGreaterThan(0);
    // Only the session went to the API.
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(json(200, { status: "ok" }));
    await services.session.signOut();
    fetch.mockResolvedValueOnce(json(200, { status: "ok", data: [] }));
    expect(await services.leads.list()).toEqual([]);
    expect(String(fetch.mock.calls.at(-1)?.[0])).toContain("/api/dashboard/leads");
  });
});
