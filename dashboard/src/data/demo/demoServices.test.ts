import { describe, expect, it } from "vitest";
import { createDemoServices } from "./demoServices";

const ME = { id: "demo-user", name: "חשבון הדגמה", initial: "ח", role: "admin" as const, passportAccess: true, demo: true };

describe("the demo's sample data", () => {
  it("fills every screen, and every lead, customer and group opens", async () => {
    const demo = createDemoServices(ME);
    const leads = await demo.leads.list();
    expect(leads.length).toBeGreaterThan(50);
    expect((await demo.leads.counts()).all).toBeGreaterThan(0);
    expect((await demo.leads.days()).length).toBeGreaterThan(20);
    for (const lead of leads) expect((await demo.leads.get(lead.id)).history.length).toBeGreaterThan(0);

    const customers = await demo.customers.list({ pageSize: 100 });
    expect(customers.total).toBe(20);
    const counts = await demo.customers.counts();
    for (const filter of ["whatsapp-today", "expiring", "missing-passport"] as const) {
      expect(counts[filter]).toBeGreaterThan(0);
      expect((await demo.customers.list({ filter, pageSize: 100 })).total).toBe(counts[filter]);
    }
    for (const customer of customers.items) {
      await demo.customers.get(customer.id);
      expect((await demo.customers.messages(customer.id)).length).toBeGreaterThan(0);
      await demo.customers.accessLog(customer.id);
    }
    expect(await demo.customers.intakes()).toHaveLength(3);

    const groups = await demo.groups.list();
    expect(groups.length).toBeGreaterThanOrEqual(4);
    for (const group of groups) {
      await demo.groups.get(group.id);
      expect(await demo.groups.participants(group.id)).toHaveLength(group.registered);
    }

    const stats = await demo.overview.stats();
    expect(stats.customers).toBe(20);
    expect(stats.weeklyLeads).toHaveLength(8);
    expect((await demo.overview.activity()).length).toBeGreaterThan(5);

    const birthdays = await demo.birthdays.overview();
    expect(birthdays.today).toHaveLength(1);
    expect(birthdays.upcoming).toHaveLength(4);
    expect(birthdays.recent).toHaveLength(5);
    expect((await demo.users.list()).users.some((user) => user.id === ME.id)).toBe(true);
    expect((await demo.imports.latest()).boards).toHaveLength(4);
  });

  it("keeps notes on a lead in memory: add, edit, delete", async () => {
    const demo = createDemoServices(ME);
    const [lead] = await demo.leads.list();
    const before = (await demo.leads.get(lead.id)).history.length;
    const note = await demo.leads.addNote(lead.id, "התקשרתי, תחזור אליי");
    expect(note).toMatchObject({ text: "התקשרתי, תחזור אליי", byUserId: ME.id, source: "crm", editedAt: null });
    let history = (await demo.leads.get(lead.id)).history;
    expect(history).toHaveLength(before + 1);
    expect(history[0].id).toBe(note.id);
    const edited = await demo.leads.editNote(lead.id, note.id, "שיחה נוספת מחר");
    expect(edited.text).toBe("שיחה נוספת מחר");
    expect(edited.editedAt).not.toBeNull();
    expect((await demo.leads.get(lead.id)).history[0].text).toBe("שיחה נוספת מחר");
    await demo.leads.deleteNote(lead.id, note.id);
    history = (await demo.leads.get(lead.id)).history;
    expect(history).toHaveLength(before);
    await expect(demo.leads.editNote(lead.id, note.id, "x")).rejects.toThrow();
    await expect(demo.leads.addNote("nope", "x")).rejects.toThrow();
  });

  it("makes, changes and removes a group, and registers a lead in it", async () => {
    const demo = createDemoServices(ME);
    const group = await demo.groups.create({ name: "פרויקט בדיקה", type: "project", capacity: 10 });
    expect(group).toMatchObject({ name: "פרויקט בדיקה", type: "project", fromCrm: true, registered: 0, capacity: 10 });
    expect((await demo.groups.list()).some((entry) => entry.id === group.id)).toBe(true);
    const renamed = await demo.groups.update(group.id, { name: "שם חדש", startsOn: "2027-01-05" });
    expect(renamed).toMatchObject({ name: "שם חדש", startsOn: "2027-01-05", fromCrm: true });

    const lead = (await demo.leads.list()).find((entry) => entry.status !== "registered")!;
    const customersBefore = (await demo.customers.list({ pageSize: 100 })).total;
    const added = await demo.groups.addLead(group.id, lead.id);
    expect(added.alreadyMember).toBe(false);
    expect((await demo.customers.list({ pageSize: 100 })).total).toBe(customersBefore + 1);
    const participants = await demo.groups.participants(group.id);
    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({ customerId: added.customerId, addedInCrm: true });
    expect((await demo.groups.get(group.id)).registered).toBe(1);
    const saved = await demo.leads.get(lead.id);
    expect(saved).toMatchObject({ status: "registered", customerId: added.customerId });
    expect(saved.groups).toEqual([{ id: group.id, name: "שם חדש", type: "project" }]);

    expect(await demo.groups.addLead(group.id, lead.id)).toEqual({ customerId: added.customerId, alreadyMember: true });
    expect(await demo.groups.participants(group.id)).toHaveLength(1);

    await demo.groups.removeMember(group.id, participants[0].id);
    expect(await demo.groups.participants(group.id)).toHaveLength(0);
    expect((await demo.leads.get(lead.id)).groups ?? []).toHaveLength(0);
    await demo.groups.addLead(group.id, lead.id);
    await demo.groups.remove(group.id);
    expect((await demo.groups.list()).some((entry) => entry.id === group.id)).toBe(false);
    await expect(demo.groups.get(group.id)).rejects.toThrow();
    await expect(demo.groups.addLead("nope", lead.id)).rejects.toThrow();
  });

  it("changes a lead's status in memory, so the demo board drags", async () => {
    const demo = createDemoServices(ME);
    const [lead] = await demo.leads.list({ status: "new" });
    expect(await demo.leads.setStatus(lead.id, "no-answer")).toMatchObject({ id: lead.id, status: "no-answer", mondayPending: false });
    expect((await demo.leads.get(lead.id)).status).toBe("no-answer");
    await expect(demo.leads.setStatus("no-such-lead", "new")).rejects.toThrow();
  });

  it("takes a greeting through writing, WhatsApp's review, a test and approval", async () => {
    const demo = createDemoServices(ME);
    const current = await demo.greetings.current();
    expect(current).toMatchObject({ status: "draft", stage: "write" });
    if (!current) return;
    expect(await demo.greetings.whatsapp()).toEqual({ connected: true, sending: true });
    const audiences = await demo.greetings.audiences();
    await demo.greetings.update(current.id, { message: "חג שמח {שם פרטי}!", audienceId: audiences[1].id });
    expect(await demo.greetings.submit(current.id)).toMatchObject({ status: "awaiting-approval", stage: "approve", template: { status: "APPROVED" } });
    expect((await demo.greetings.sendTest(current.id)).lastTest?.toUserId).toBe(ME.id);
    expect(await demo.greetings.approve(current.id)).toMatchObject({ status: "scheduled", stage: "track", approvedByUserId: ME.id });
    const history = await demo.greetings.history();
    expect(history.filter((campaign) => campaign.status === "completed").length).toBeGreaterThan(0);
    expect((await demo.greetings.create()).id).toBe(current.id);
    // Editing the text after approval sends it back to be written and reviewed again.
    expect(await demo.greetings.update(current.id, { message: "טקסט חדש" })).toMatchObject({ status: "draft", approvedAt: null });
  });

  it("opens passports, saves notes, and changes people, permissions, switches and birthdays", async () => {
    const demo = createDemoServices(ME);
    const withPassport = (await demo.customers.list({ pageSize: 100 })).items.find((customer) => customer.passport);
    if (!withPassport) throw new Error("no passport in the sample data");
    const reveal = await demo.customers.logPassportView(withPassport.id, "details");
    expect(reveal.number).toBe(withPassport.passport?.number);
    expect((await demo.customers.accessLog(withPassport.id))[0]).toMatchObject({ action: "passport-view", byUserId: ME.id });
    expect((await demo.customers.addNote(withPassport.id, "הערה לדוגמה")).notes[0]).toMatchObject({ text: "הערה לדוגמה", byUserId: ME.id });

    const team = await demo.users.list();
    const sales = team.users.find((user) => user.role === "sales");
    if (!sales) throw new Error("no sales user in the sample data");
    expect((await demo.users.changeAccess(sales.id, { role: "office", passportAccess: true })).users.find((user) => user.id === sales.id)).toMatchObject({
      role: "office",
      passportAccess: true,
    });
    expect((await demo.users.changeSignIn(sales.id, { username: "noa.k", password: "a-new-password" })).users.find((user) => user.id === sales.id)).toMatchObject({
      username: "noa.k",
      hasPassword: true,
    });
    const { invite } = await demo.users.invite({ email: "New@Example.com", name: "חדשה", role: "sales", passportAccess: true });
    expect(invite).toMatchObject({ email: "new@example.com", passportAccess: false });
    await demo.users.remove(invite.id);
    expect((await demo.users.list()).invites.some((entry) => entry.id === invite.id)).toBe(false);
    expect((await demo.users.changePermission({ role: "office", area: "import", access: "view" })).find((row) => row.area === "import")?.access.office).toBe("view");
    expect((await demo.users.updateSecurity("autoSignOut", false)).autoSignOut).toBe(false);
    expect((await demo.users.updateProfile({ name: "דמו", whatsappPhone: "0509999999" })).whatsappPhone).toBe("0509999999");
    expect((await demo.birthdays.updateSettings({ enabled: false, template: "מזל טוב {שם פרטי}" })).approvedTemplate).toBe("מזל טוב {שם פרטי}");

    const actions = (await demo.users.audit()).map((entry) => entry.action);
    for (const action of ["passport-view", "staff-access-changed", "username-changed", "password-set", "staff-invited", "staff-removed", "permission-change", "security-change", "staff-phone-changed"]) {
      expect(actions).toContain(action);
    }
  });

  it("runs a copy from Monday", async () => {
    const demo = createDemoServices(ME);
    expect(await demo.imports.copyNow()).toMatchObject({ status: "running", trigger: "manual", byUserId: ME.id });
    expect((await demo.imports.latest()).lastRun?.status).toBe("running");
  });
});
