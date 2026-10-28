import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingBlock } from "./states";

describe("states", () => {
  it("announces loading", () => {
    render(<LoadingBlock lines={2} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("טוען…");
  });

  it("offers the next step when there is nothing to show", () => {
    render(<EmptyState message="No leads" action={<button type="button">Clear filters</button>} />);
    expect(screen.getByText("No leads")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("retries from an error inside the card", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("משהו השתבש בטעינה.");
    await userEvent.click(screen.getByRole("button", { name: "לנסות שוב" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
