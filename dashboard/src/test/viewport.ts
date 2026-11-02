/** Sets window.innerWidth so the matchMedia stub in setup.ts picks the desktop or phone shell. */
export function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}
