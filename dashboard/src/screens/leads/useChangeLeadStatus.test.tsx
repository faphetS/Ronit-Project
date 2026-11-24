import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, type Services } from "../../data/services";
import type { Lead } from "../../data/types";
import { createTestClient, signedInServices, TestProviders } from "../../test/app";
import { testLead } from "../../test/leads";
import { ToastContext } from "../../ui/toast-context";
import { useChangeLeadStatus } from "./useChangeLeadStatus";

interface Deferred {
  resolve: (lead: Lead) => void;
  reject: (error: unknown) => void;
}

async function setup() {
  const services: Services = await signedInServices();
  const calls: Deferred[] = [];
  services.leads.setStatus = vi.fn(
    () => new Promise<Lead>((resolve, reject) => calls.push({ resolve, reject })),
  );
  const show = vi.fn(() => "");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders services={services} client={createTestClient()}>
      <ToastContext.Provider value={{ show, dismiss: () => {} }}>{children}</ToastContext.Provider>
    </TestProviders>
  );
  return { calls, show, wrapper };
}

describe("useChangeLeadStatus", () => {
  it("still says why when an earlier move fails after a later one started", async () => {
    const { calls, show, wrapper } = await setup();
    const lead = testLead({ status: "new" });
    const { result } = renderHook(() => useChangeLeadStatus(), { wrapper });
    result.current(lead, "talking");
    result.current(lead, "no-answer");
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[0].reject(new Error("boom"));
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(show).toHaveBeenCalledWith({ message: "הסטטוס לא השתנה. כדאי לנסות שוב", tone: "warning" });
  });

  it("still says why when the control is gone before the move fails", async () => {
    const { calls, show, wrapper } = await setup();
    const lead = testLead({ status: "new" });
    const { result, unmount } = renderHook(() => useChangeLeadStatus(), { wrapper });
    result.current(lead, "talking");
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    unmount();
    calls[0].reject(new NotFoundError("Lead", lead.id));
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(show).toHaveBeenCalledWith({ message: "הסטטוס לא השתנה: הליד הזה כבר לא בלוח", tone: "warning" });
  });
});
