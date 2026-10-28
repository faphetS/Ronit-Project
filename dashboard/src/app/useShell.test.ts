import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setViewportWidth } from "../test/viewport";
import { useShell } from "./useShell";

describe("useShell", () => {
  it("uses the desktop shell from 1024px", () => {
    setViewportWidth(1024);
    expect(renderHook(() => useShell()).result.current).toBe("desktop");
  });

  it("uses the phone shell below 1024px", () => {
    setViewportWidth(390);
    expect(renderHook(() => useShell()).result.current).toBe("phone");
  });
});
