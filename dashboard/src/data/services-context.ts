import { createContext, useContext } from "react";
import type { Services } from "./services";

export const ServicesContext = createContext<Services | null>(null);

/** The backend the screens talk to. Read data through the hooks in queries.ts, not directly. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside <ServicesProvider>");
  return services;
}
