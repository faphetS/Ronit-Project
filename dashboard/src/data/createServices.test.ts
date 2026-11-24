import { describe, expect, it, vi } from "vitest";
import { createServices } from "./createServices";
import { NotFoundError } from "./services";

/** A fetch that answers every call with `body` and `status`, and records what was asked. */
function stubFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const DEMO = {
  session: { userId: "d1", signedInAt: "2026-11-17T10:00:00.000Z" },
  user: { id: "d1", name: "חשבון הדגמה", initial: "ח", role: "admin", passportAccess: true, demo: true },
};

describe("createServices", () => {
  it("reads the dashboard API with the sign-in cookie, and unwraps its answers", async () => {
    const fetch = stubFetch({ status: "ok", data: [{ id: "l-1", name: "נועה" }] });
    const services = createServices({ apiUrl: "", fetch });
    expect(await services.leads.list({ status: "no-answer", search: " נועה " })).toEqual([{ id: "l-1", name: "נועה" }]);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`/api/dashboard/leads?status=no-answer&search=${encodeURIComponent("נועה")}`);
    expect(init).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("sends changes as JSON posts", async () => {
    const fetch = stubFetch({ status: "ok", data: { invite: { id: "u-2" }, emailed: true } });
    const services = createServices({ apiUrl: "https://api.example.com", fetch });
    await services.users.invite({ email: "tal@example.com", name: "טל", role: "sales", passportAccess: false });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/dashboard/users/invites");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ email: "tal@example.com", name: "טל", role: "sales", passportAccess: false }) });
  });

  it("turns a 404 into the NotFoundError the screens recognise", async () => {
    const services = createServices({ apiUrl: "", fetch: stubFetch({ status: "error", code: "NOT_FOUND", message: "Lead not found" }, 404) });
    await expect(services.leads.get("l-gone")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("sends a note's tags, and reads and marks the signed-in user's tags", async () => {
    const fetch = stubFetch({ status: "ok", data: { unread: 0, items: [] } });
    const services = createServices({ apiUrl: "", fetch });
    await services.leads.addNote("l-1", "@מיכל לוי", ["u-michal"]);
    await services.leads.editNote("l-1", "n-1", "שלום", []);
    // Without tags, an edit leaves the note's tags as they are.
    await services.leads.editNote("l-1", "n-1", "שלום");
    expect(await services.leads.mentions()).toEqual({ unread: 0, items: [] });
    await services.leads.markMentionsSeen(["n-1"]);
    await services.leads.markMentionsSeen();
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      ["/api/dashboard/leads/l-1/notes", "POST", JSON.stringify({ text: "@מיכל לוי", mentions: ["u-michal"] })],
      ["/api/dashboard/leads/l-1/notes/n-1", "POST", JSON.stringify({ text: "שלום", mentions: [] })],
      ["/api/dashboard/leads/l-1/notes/n-1", "POST", JSON.stringify({ text: "שלום" })],
      ["/api/dashboard/mentions", "GET", undefined],
      ["/api/dashboard/mentions/seen", "POST", JSON.stringify({ noteIds: ["n-1"] })],
      ["/api/dashboard/mentions/seen", "POST", JSON.stringify({})],
    ]);
  });

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
