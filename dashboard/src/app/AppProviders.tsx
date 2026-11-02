import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LocaleProvider } from "../content/LocaleProvider";
import { createMockServices, failingFromSearch } from "../data/mock/createMockServices";
import { createQueryClient } from "../data/queryClient";
import { ServicesProvider } from "../data/ServicesProvider";
import { MotionRoot } from "../motion/MotionRoot";
import { ToastProvider } from "../ui/Toast";

/** Data, the query cache, the language, motion defaults and toasts for the whole app. The shell runs on the mock services. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const [services] = useState(() =>
    createMockServices({ failing: import.meta.env.DEV ? failingFromSearch(window.location.search) : undefined }),
  );
  return (
    <QueryClientProvider client={client}>
      <ServicesProvider services={services}>
        <LocaleProvider>
          <MotionRoot>
            <ToastProvider>{children}</ToastProvider>
          </MotionRoot>
        </LocaleProvider>
      </ServicesProvider>
    </QueryClientProvider>
  );
}
