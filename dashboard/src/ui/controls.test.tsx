import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../test/router";
import { Button } from "./Button";
import { ChipGroup } from "./ChipGroup";
import { Field } from "./Field";
import { GooButton } from "./GooButton";
import { IconButton } from "./IconButton";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

function SwitchHarness() {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onChange={setOn} label="auto send" />;
}

describe("controls", () => {
  it("toggles a switch", async () => {
    render(<SwitchHarness />);
    const toggle = screen.getByRole("switch", { name: "auto send" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("selects one chip at a time", async () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        id="status"
        label="status"
        value="all"
        onChange={onChange}
        options={[
          { value: "all", label: "All", count: 24 },
          { value: "new", label: "New", count: 6 },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "All 24" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "New 6" }));
    expect(onChange).toHaveBeenCalledWith("new");
  });

  it("labels a field and reports typing", async () => {
    const onChange = vi.fn();
    render(<Field label="Email" icon="at" name="email" type="email" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    expect(onChange).toHaveBeenLastCalledWith("a@b.co");
  });

  it("names icon-only buttons and links", async () => {
    renderInRouter(
      <>
        <IconButton icon="bell" label="Notifications, 2 new" badge={2} />
        <IconButton icon="import" label="Import" to="/import" />
      </>,
    );
    expect(await screen.findByRole("button", { name: "Notifications, 2 new" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/import");
  });

  it("renders buttons as links when they have a destination", async () => {
    renderInRouter(
      <>
        <Button to="/leads">All leads</Button>
        <GooButton to="/login">Sign in</GooButton>
      </>,
    );
    expect(await screen.findByRole("link", { name: "All leads" })).toHaveAttribute("href", "/leads");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("marks the current segment in navigation", async () => {
    renderInRouter(
      <Segmented
        id="greetings"
        label="Greetings"
        value="holidays"
        options={[
          { value: "holidays", label: "Holidays", to: "/greetings/holidays" },
          { value: "birthdays", label: "Birthdays", to: "/greetings/birthdays" },
        ]}
      />,
    );
    expect(await screen.findByRole("navigation", { name: "Greetings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Holidays" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Birthdays" })).not.toHaveAttribute("aria-current");
  });
});
