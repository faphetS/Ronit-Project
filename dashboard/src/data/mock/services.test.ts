import { describe, expect, it } from "vitest";
import { dayAt } from "../../lib/clock";
import { NotFoundError, ServiceUnavailableError, SignInError } from "../services";
import { createMockServices, failingFromSearch, latencyFromEnv, type MockOptions } from "./createMockServices";
import { createDatabase } from "./generate";

const db = createDatabase({ seed: 5787, today: dayAt("2026-10-28") });
const make = (options: MockOptions = {}) => createMockServices({ db, latency: [0, 0], now: () => dayAt("2026-10-28", "15:30"), ...options });

describe("mock services", () => {
  it("signs in like the real sign-in: Google, then any 6 digits", async () => {
    const services = make();
    expect(await services.session.current()).toBeNull();
    expect(await services.session.pendingCode()).toBeNull();
    await expect(services.session.verifyCode("123456")).rejects.toEqual(new SignInError("step-expired"));
    expect(await services.session.startGoogle({ remember: true, returnTo: "/" })).toEqual({ step: "code-required" });
    expect(await services.session.pendingCode()).toEqual({ email: expect.stringMatching(/^\w\*\*\*@/) });
    await services.session.resendCode();
    await expect(services.session.verifyCode("12345")).rejects.toEqual(new SignInError("invalid-code"));
    const { signedIn, returnTo } = await services.session.verifyCode("123456");
    expect(signedIn.user.name).toBe("רונית ברש");
    expect(returnTo).toBe("/");
    expect((await services.session.current())?.user.id).toBe("u-ronit");
    await services.session.signOut();
    expect(await services.session.current()).toBeNull();
  });

  it("lists the open pipeline with counts, newest first", async () => {
    const services = make();
    expect(await services.leads.counts()).toMatchObject({ all: 24, new: 6, talking: 11, "details-sent": 4, registered: 3, "not-relevant": 1 });
    const talking = await services.leads.list({ status: "talking" });
    expect(talking).toHaveLength(11);
    expect(talking[0].updatedAt >= talking[1].updatedAt).toBe(true);
  });

  it("searches leads by name or phone", async () => {
    const services = make();
    expect((await services.leads.list({ search: "יעל פרץ" })).map((l) => l.id)).toContain("l-yael-peretz");
    expect((await services.leads.list({ search: "054-221" })).map((l) => l.id)).toContain("l-yael-peretz");
  });

  it("changes a lead's status and records it in the history", async () => {
    const services = make();
    const lead = await services.leads.updateStatus("l-noa-biton", "talking");
    expect(lead.status).toBe("talking");
    expect(lead.history[0].text).toBe("הסטטוס עודכן: בשיחה");
    expect((await services.leads.counts()).new).toBe(5);
  });

  it("never hands out its internal objects", async () => {
    const services = make();
    const lead = await services.leads.get("l-yael-peretz");
    lead.name = "changed";
    expect((await services.leads.get("l-yael-peretz")).name).toBe("יעל פרץ");
  });

  it("filters and pages customers", async () => {
    const services = make();
    const page = await services.customers.list({ page: 2, pageSize: 25 });
    expect(page).toMatchObject({ total: 412, page: 2, pageSize: 25 });
    expect(page.items).toHaveLength(25);
    expect((await services.customers.list({ filter: "missing-passport" })).total).toBe(23);
    expect((await services.customers.list({ filter: "expiring" })).total).toBe(5);
    expect((await services.customers.list({ filter: "whatsapp-today" })).items.map((c) => c.id)).toEqual(["c-sara-cohen", "c-lea-berger"]);
    expect((await services.customers.intakes())[0].id).toBe("i-sara");
  });

  it("summarizes groups and the overview", async () => {
    const services = make();
    const groups = await services.groups.list();
    expect(groups.find((g) => g.id === "g-poland-nov")).toMatchObject({ registered: 32, passportsReceived: 29, capacity: 40 });
    const stats = await services.overview.stats();
    expect(stats).toMatchObject({
      openLeads: 24,
      customers: 412,
      activeGroups: 4,
      newLeadsThisWeek: 14,
      newLeadsLastWeek: 9,
      thisWeekByStatus: { new: 6, talking: 5, registered: 3 },
    });
    expect(stats.weeklyLeads.map((w) => w.count)).toEqual([8, 11, 7, 12, 9, 10, 9, 14]);
  });

  it("reports missing records and simulated outages", async () => {
    await expect(make().leads.get("nope")).rejects.toBeInstanceOf(NotFoundError);
    const broken = make({ failing: new Set(["leads"] as const) });
    await expect(broken.leads.counts()).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(await broken.groups.list()).toHaveLength(4);
  });

  it("reads the delay and the failing services from config", () => {
    expect(latencyFromEnv("10,20")).toEqual([10, 20]);
    expect(latencyFromEnv("oops")).toEqual([120, 300]);
    expect([...failingFromSearch("?mock-error=leads,bogus")]).toEqual(["leads"]);
  });
});
