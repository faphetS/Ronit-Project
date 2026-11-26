import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Services } from "../../data/services";
import type { GroupSummary } from "../../data/types";
import { renderApp, RoleKnown, signedInAs, signedInServices } from "../../test/app";
import { NextTripCard } from "./NextTrip";

// Today in the tests is 28.10.2026 (src/test/setup.ts).
function trip(fields: Partial<GroupSummary> & Pick<GroupSummary, "id" | "shortName">): GroupSummary {
  return {
    name: fields.shortName,
    type: "flight",
    womenOnly: true,
    capacity: null,
    startsOn: null,
    endsOn: null,
    dateLabel: null,
    flight: null,
    mondayBoard: null,
    fromCrm: true,
    registered: 0,
    passportsReceived: 0,
    missingPassports: 0,
    readiness: null,
    ...fields,
  };
}

async function withGroups(groups: GroupSummary[], base?: Services): Promise<Services> {
  const services = base ?? (await signedInServices());
  return { ...services, groups: { ...services.groups, list: async () => groups } };
}

const renderCard = (services: Services) =>
  renderApp(
    [
      {
        path: "*",
        element: (
          <>
            <RoleKnown />
            <NextTripCard />
          </>
        ),
      },
    ],
    { services },
  );

describe("NextTripCard", () => {
  it("counts the days to the next flight on a flight tracker, with its seats, passports and the flight after it", async () => {
    const services = await withGroups([
      trip({ id: "e-1", shortName: "חלה · דצמבר", type: "event", startsOn: "2026-12-01", endsOn: "2026-12-31", dateLabel: "דצמבר 2026" }),
      trip({ id: "f-2", shortName: "אומן · אדר", startsOn: "2027-03-03", endsOn: "2027-03-07" }),
      trip({ id: "f-1", shortName: "אומן · חנוכה", startsOn: "2026-11-07", endsOn: "2026-11-11", capacity: 40, registered: 12, readiness: 75 }),
      trip({ id: "f-old", shortName: "אומן · ט״ו באב", startsOn: "2026-08-01", endsOn: "2026-08-05" }),
    ]);
    renderCard(services);
    // The card holds its place with a loading shell of the same name until the groups are in.
    const name = await screen.findByRole("link", { name: "אומן · חנוכה" });
    const card = screen.getByRole("region", { name: "הטיסה הקרובה" });
    expect(name).toHaveAttribute("href", "/groups/f-1");
    expect(within(card).getByText("ימים להמראה")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "עוד 10 ימים עד ההמראה" })).toBeInTheDocument();
    // The flight tracker runs from home to the trip's place, which leads its name.
    expect(within(card).getByText("ישראל")).toBeInTheDocument();
    expect(within(card).getByText("אומן")).toBeInTheDocument();
    expect(within(card).getByText(/07\.11 – 11\.11/)).toBeInTheDocument();
    expect(within(card).getByText("12 מתוך 40 מקומות · דרכונים 75%")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /אחר כך · אומן · אדר · 03\.03/ })).toHaveAttribute("href", "/groups/f-2");
    // The event comes after the flight, so the flight is the nearest thing and the stub doesn't name it.
    expect(within(card).queryByText("האירוע הקרוב")).not.toBeInTheDocument();
  });

  it("keeps the flight on the card, and puts an event that comes first on its stub", async () => {
    const services = await withGroups([
      trip({ id: "e-1", shortName: "ערב חלה", type: "event", startsOn: "2026-10-31" }),
      trip({ id: "f-1", shortName: "אומן · חנוכה", startsOn: "2026-11-07" }),
    ]);
    renderCard(services);
    await screen.findByRole("link", { name: "אומן · חנוכה" });
    const card = screen.getByRole("region", { name: "הטיסה הקרובה" });
    expect(within(card).getByText("האירוע הקרוב")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "ערב חלה" })).toHaveAttribute("href", "/groups/e-1");
    expect(within(card).getByText("· בעוד 3 ימים")).toBeInTheDocument();
  });

  it("shows a flight under way by its day, and when it comes back", async () => {
    const services = await withGroups([
      trip({ id: "f-1", shortName: "אומן · חשוון", startsOn: "2026-10-26", endsOn: "2026-10-30" }),
      trip({ id: "f-2", shortName: "אומן · חנוכה", startsOn: "2026-11-07" }),
    ]);
    renderCard(services);
    const card = await screen.findByRole("region", { name: "בנסיעה עכשיו" });
    expect(within(card).getByRole("link", { name: "אומן · חשוון" })).toHaveAttribute("href", "/groups/f-1");
    expect(within(card).getByText("ימי הנסיעה")).toBeInTheDocument();
    expect(within(card).getByText("חוזרים ב־30.10")).toBeInTheDocument();
  });

  it("says when the flight leaves today", async () => {
    renderCard(await withGroups([trip({ id: "f-1", shortName: "אומן · חשוון", startsOn: "2026-10-28" })]));
    await screen.findByRole("link", { name: "אומן · חשוון" });
    const card = screen.getByRole("region", { name: "הטיסה הקרובה" });
    expect(within(card).getByRole("img", { name: "הטיסה יוצאת היום" })).toBeInTheDocument();
  });

  it("points to the groups when no flight has a date, and still names the nearest event", async () => {
    renderCard(
      await withGroups([
        trip({ id: "f-1", shortName: "אומן · ט״ו באב" }),
        trip({ id: "e-1", shortName: "חלה · נובמבר", type: "event", startsOn: "2026-11-01", endsOn: "2026-11-30", dateLabel: "נובמבר 2026" }),
      ]),
    );
    expect(await screen.findByText("אין עדיין טיסה עם תאריך")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "לקבוצות" })).toHaveAttribute("href", "/groups");
    expect(screen.getByRole("link", { name: "חלה · נובמבר" })).toHaveAttribute("href", "/groups/e-1");
  });

  it("isn't there for a role that may not see the groups", async () => {
    const sales = await signedInAs("sales");
    const services = await withGroups([trip({ id: "f-1", shortName: "אומן · חנוכה", startsOn: "2026-11-07" })], {
      ...sales,
      users: {
        ...sales.users,
        permissions: async () =>
          (await sales.users.permissions()).map((row) => (row.area === "customers" ? { ...row, access: { ...row.access, sales: "none" } } : row)),
      },
    });
    renderCard(services);
    await screen.findByText("role known");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
