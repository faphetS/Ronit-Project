import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { Headline } from "./Headline";
import { Icon } from "./Icon";
import { Ltr } from "./Ltr";
import { Meter } from "./Meter";
import { OrbCard } from "./OrbCard";
import { Scene } from "./Scene";
import { StatusTag } from "./StatusTag";
import { Surface } from "./Surface";

describe("display components", () => {
  it("draws icons as hidden decoration", () => {
    const { container } = render(<Icon name="bell" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("renders a surface as a labelled region with its material", () => {
    render(
      <Surface variant="glass" aria-label="panel">
        x
      </Surface>,
    );
    expect(screen.getByRole("region", { name: "panel" })).toHaveClass("surface-glass", "rounded-card");
  });

  it("uses phone density when compact", () => {
    render(
      <Surface variant="ink" compact aria-label="dark">
        x
      </Surface>,
    );
    expect(screen.getByRole("region", { name: "dark" })).toHaveClass("surface-ink", "rounded-card-phone");
  });

  it("puts both headline tones in one heading", () => {
    render(<Headline title="Hello" soft="world" />);
    expect(screen.getByRole("heading", { level: 1, name: "Hello world" })).toBeInTheDocument();
  });

  it("shows status as words next to a colored dot", () => {
    const { container } = render(<StatusTag tone="talking">in talks</StatusTag>);
    expect(screen.getByText("in talks")).toBeInTheDocument();
    expect(container.querySelector('[data-tone="talking"]')).toHaveClass("bg-status-talking");
  });

  it("renders the orb card with strip and side content", () => {
    render(<OrbCard label="today" strip={<p>strip</p>} side={<p>side</p>} />);
    const card = screen.getByRole("region", { name: "today" });
    expect(card).toHaveTextContent("strip");
    expect(card).toHaveTextContent("side");
    expect(card.querySelector(".orb")).toHaveAttribute("aria-hidden", "true");
  });

  it("hides the decorative avatar and scene from assistive tech", () => {
    const { container } = render(
      <>
        <Avatar initial="R" gold />
        <Scene preset="phone" />
      </>,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    expect(container.querySelector(".avatar-gold")).toHaveTextContent("R");
  });

  it("reports meter progress", () => {
    render(<Meter value={0.8} label="registered" />);
    expect(screen.getByRole("meter", { name: "registered" })).toHaveAttribute("aria-valuenow", "80");
  });

  it("keeps LTR runs in order", () => {
    const { container } = render(<Ltr>054-•••-2219</Ltr>);
    expect(container.querySelector("bdi")).toHaveAttribute("dir", "ltr");
  });
});
