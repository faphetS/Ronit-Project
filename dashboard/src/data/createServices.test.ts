import { describe, expect, it, vi } from "vitest";
import { createServices } from "./createServices";
import { NotFoundError } from "./services";

/** A fetch that answers every call with `body` and `status`, and records what was asked. */
function stubFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

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
});
