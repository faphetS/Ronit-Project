import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useCloseOnOutsidePress } from "./useCloseOnOutsidePress";

function Harness({ onClose, active = true }: { onClose: () => void; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnOutsidePress(ref, onClose, active);
  return (
    <div>
      <div ref={ref}>
        <button type="button">inside</button>
      </div>
      <button type="button">outside</button>
      <a href="/leads/other?day=2026-11-20">another lead</a>
      <div role="listbox">
        <span>menu option</span>
      </div>
      <div data-toast="">
        <button type="button">toast button</button>
      </div>
    </div>
  );
}

describe("useCloseOnOutsidePress", () => {
  it("closes on a main-button press outside, and on nothing else", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    for (const text of ["inside", "another lead", "menu option", "toast button"]) fireEvent.pointerDown(screen.getByText(text), { button: 0 });
    fireEvent.pointerDown(screen.getByText("outside"), { button: 2 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText("outside"), { button: 0 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing while no lead is open", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} active={false} />);
    fireEvent.pointerDown(screen.getByText("outside"), { button: 0 });
    expect(onClose).not.toHaveBeenCalled();
  });
});
