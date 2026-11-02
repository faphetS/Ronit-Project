import type { ReactNode } from "react";

/** Keeps an LTR run (a phone or passport number) in order inside RTL text. */
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}
