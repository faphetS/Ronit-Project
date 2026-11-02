import { act, render, screen } from "@testing-library/react";
import { MotionConfigContext } from "motion/react";
import { useContext } from "react";
import { describe, expect, it } from "vitest";
import { renderRoutes } from "../test/router";
import { AnimatedOutlet } from "./AnimatedOutlet";
import { MotionRoot } from "./MotionRoot";
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

describe("AnimatedOutlet", () => {
  it("swaps pages on navigation", async () => {
    const { router } = renderRoutes([
      {
        path: "/",
        element: <AnimatedOutlet />,
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
          element: <AnimatedOutlet pageKey={pageKey} />,
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
});

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
    expect(profile.parentElement).toHaveStyle({ zIndex: "2" });
    await act(() => router.navigate(-1));
    expect(await screen.findByRole("heading", { name: "list" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "profile" })).not.toBeInTheDocument();
  });
});
