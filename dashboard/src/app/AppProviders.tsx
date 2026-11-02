import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LocaleProvider } from "../content/LocaleProvider";
import { createServices, httpServicesFromEnv } from "../data/createServices";
import { failingFromSearch } from "../data/mock/createMockServices";
import { createQueryClient } from "../data/queryClient";
import { ServicesProvider } from "../data/ServicesProvider";
import { MotionRoot } from "../motion/MotionRoot";
import { ToastProvider } from "../ui/Toast";

/** Data, the query cache, the language, motion defaults and toasts for the whole app. VITE_HTTP_SERVICES picks the services that use Ronit's API; the rest run on the demo data. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const [services] = useState(() =>
    createServices({
      http: httpServicesFromEnv(),
      apiUrl: import.meta.env.VITE_API_URL ?? "",
      mock: { failing: import.meta.env.DEV ? failingFromSearch(window.location.search) : undefined },
    }),
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
