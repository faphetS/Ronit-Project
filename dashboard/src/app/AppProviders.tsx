import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createMockServices, failingFromSearch } from "../data/mock/createMockServices";
import { createQueryClient } from "../data/queryClient";
import { ServicesProvider } from "../data/ServicesProvider";
import { MotionRoot } from "../motion/MotionRoot";

/** Data, the query cache and motion defaults for the whole app. The shell runs on the mock services. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const [services] = useState(() =>
    createMockServices({ failing: import.meta.env.DEV ? failingFromSearch(window.location.search) : undefined }),
  );
  return (
    <QueryClientProvider client={client}>
      <ServicesProvider services={services}>
        <MotionRoot>{children}</MotionRoot>
      </ServicesProvider>
    </QueryClientProvider>
  );
}
