import { act, render, screen } from "@testing-library/react";
import { MotionConfigContext } from "motion/react";
import { useContext, useLayoutEffect, useRef } from "react";
import { describe, expect, it } from "vitest";
import { renderRoutes } from "../test/router";
import { MotionRoot } from "./MotionRoot";
import { SectionReel } from "./SectionReel";
import { StackOutlet } from "./StackOutlet";

function ReducedMotionSetting() {
  return <span>{String(useContext(MotionConfigContext).reducedMotion)}</span>;
}

describe("MotionRoot", () => {
  it("follows the system Reduce Motion setting", () => {
    render(
      <MotionRoot>
        <ReducedMotionSetting />
      </MotionRoot>,
    );
    expect(screen.getByText("user")).toBeInTheDocument();
  });
});

// Three places on the reel: home, leads (with its lead pages) and groups.
const PLACES = ["/", "/leads", "/groups"];
const placeOf = (pathname: string) => (pathname.startsWith("/leads") ? 1 : PLACES.indexOf(pathname));
const leadsKey = (pathname: string) => (pathname.startsWith("/leads") ? "/leads" : pathname);
const MAIN_PAGES = [
  { path: "/", element: <h1>home</h1> },
  { path: "/leads", element: <h1>leads</h1> },
  { path: "/groups", element: <h1>groups</h1> },
];

describe("SectionReel", () => {
  it("swaps pages on navigation", async () => {
    const { router } = renderRoutes([
      {
        path: "/",
        element: <SectionReel pageKey={leadsKey} sectionOf={placeOf} sections={MAIN_PAGES} />,
        children: [
          { index: true, element: <h1>home</h1> },
          { path: "leads", element: <h1>leads</h1> },
        ],
      },
    ]);
    expect(await screen.findByRole("heading", { name: "home" })).toBeInTheDocument();
    await act(() => router.navigate("/leads"));
    expect(await screen.findByRole("heading", { name: "leads" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "home" })).not.toBeInTheDocument();
  });

  it("keeps one page for paths that share a page key", async () => {
    const pageKey = (pathname: string) => (pathname.startsWith("/leads") ? "/leads" : pathname);
    const { router } = renderRoutes(
      [
        {
          path: "/",
          element: <SectionReel pageKey={pageKey} sectionOf={placeOf} sections={MAIN_PAGES} />,
          children: [
            { path: "leads", element: <h1>list</h1> },
            { path: "leads/:id", element: <h1>panel</h1> },
          ],
        },
      ],
      "/leads",
    );
    const page = (await screen.findByRole("heading", { name: "list" })).parentElement;
    await act(() => router.navigate("/leads/7"));
    expect((await screen.findByRole("heading", { name: "panel" })).parentElement).toBe(page);
  });

  it("spins past the sections in between, hidden from assistive tech", async () => {
    const passed: boolean[] = [];
    const sections = [MAIN_PAGES[0], { path: "/leads", element: <Passing onMount={(hidden) => passed.push(hidden)} /> }, MAIN_PAGES[2]];
    const { router } = renderRoutes([
      {
        path: "/",
        element: <SectionReel pageKey={leadsKey} sectionOf={placeOf} sections={sections} />,
        children: [
          { index: true, element: <h1>home</h1> },
          { path: "groups", element: <h1>groups</h1> },
        ],
      },
    ]);
    expect(await screen.findByRole("heading", { name: "home" })).toBeInTheDocument();
    await act(() => router.navigate("/groups"));
    expect(await screen.findByRole("heading", { name: "groups" })).toBeInTheDocument();
    expect(passed).toEqual([true]);
  });
});

/** A section's main page that notes, as it appears, whether assistive tech can see it. */
function Passing({ onMount }: { onMount: (hidden: boolean) => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    onMount(Boolean(ref.current?.closest("[aria-hidden='true']")));
  }, [onMount]);
  return <h1 ref={ref}>leads</h1>;
}

describe("StackOutlet", () => {
  it("stacks a pushed screen above the list and pops back", async () => {
    const { router } = renderRoutes(
      [
        {
          path: "/",
          element: <StackOutlet isPushed={(pathname) => pathname.startsWith("/customers/")} />,
          children: [
            { path: "customers", element: <h1>list</h1> },
            { path: "customers/:id", element: <h1>profile</h1> },
          ],
        },
      ],
      "/customers",
    );
    await act(() => router.navigate("/customers/c1"));
    const profile = await screen.findByRole("heading", { name: "profile" });
    expect(profile.closest("[style*='z-index']")).toHaveStyle({ zIndex: "2" });
    await act(() => router.navigate(-1));
    expect(await screen.findByRole("heading", { name: "list" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "profile" })).not.toBeInTheDocument();
  });
});
