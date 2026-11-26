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
  it("counts the days to the nearest flight on a flight tracker, with its seats, passports and the trip after it", async () => {
    const services = await withGroups([
      trip({ id: "e-1", shortName: "חלה · דצמבר", type: "event", startsOn: "2026-12-01", endsOn: "2026-12-31", dateLabel: "דצמבר 2026" }),
      trip({ id: "f-1", shortName: "אומן · חנוכה", startsOn: "2026-11-07", endsOn: "2026-11-11", capacity: 40, registered: 12, readiness: 75 }),
      trip({ id: "f-old", shortName: "אומן · ט״ו באב", startsOn: "2026-08-01", endsOn: "2026-08-05" }),
    ]);
    renderCard(services);
    // The card holds its place with a loading shell of the same name until the groups are in.
    const name = await screen.findByRole("link", { name: "אומן · חנוכה" });
    const card = screen.getByRole("region", { name: "הטיסה הקרובה" });
    expect(name).toHaveAttribute("href", "/groups/f-1");
    expect(within(card).getByText("ימים להמראה")).toBeInTheDocument();
    // The flight tracker runs from home to the trip's place, which leads its name.
    expect(within(card).getByText("ישראל")).toBeInTheDocument();
    expect(within(card).getByText("אומן")).toBeInTheDocument();
    expect(within(card).getByText(/07\.11 – 11\.11/)).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "עוד 10 ימים עד היציאה" })).toBeInTheDocument();
    expect(within(card).getByText("12 מתוך 40 מקומות · דרכונים 75%")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /אחר כך · חלה · דצמבר · דצמבר 2026/ })).toHaveAttribute("href", "/groups/e-1");
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

  it("says when the nearest event is today", async () => {
    renderCard(await withGroups([trip({ id: "e-1", shortName: "ערב נשים", type: "event", startsOn: "2026-10-28" })]));
    const card = await screen.findByRole("region", { name: "האירוע הקרוב" });
    expect(within(card).getByText("האירוע היום")).toBeInTheDocument();
  });

  it("points to the groups when no flight or event has a date", async () => {
    renderCard(await withGroups([trip({ id: "f-1", shortName: "אומן · ט״ו באב" })]));
    expect(await screen.findByText("אין עדיין טיסה או אירוע עם תאריך")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "לקבוצות" })).toHaveAttribute("href", "/groups");
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
