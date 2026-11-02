import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LocaleProvider } from "../content/LocaleProvider";
import { createServices } from "../data/createServices";
import { createQueryClient } from "../data/queryClient";
import { ServicesProvider } from "../data/ServicesProvider";
import { MotionRoot } from "../motion/MotionRoot";
import { ToastProvider } from "../ui/Toast";

/** Data from Ronit's API, the query cache, the language, motion defaults and toasts for the whole app. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const [services] = useState(() => createServices({ apiUrl: import.meta.env.VITE_API_URL ?? "" }));
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
