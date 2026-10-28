import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TestProviders, createTestClient, createTestServices } from "../test/app";
import { queryKeys, useLead, useLeadCounts, useOverview, useSession, useSignIn, useUpdateLeadStatus } from "./queries";
import type { Lead } from "./types";

function setup() {
  const services = createTestServices();
  const client = createTestClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders services={services} client={client}>
      {children}
    </TestProviders>
  );
  return { services, client, wrapper };
}

describe("query hooks", () => {
  it("signs in and updates the session", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ session: useSession(), signIn: useSignIn() }), { wrapper });
    await waitFor(() => expect(result.current.session.isSuccess).toBe(true));
    expect(result.current.session.data).toBeNull();
    await act(() => result.current.signIn.mutateAsync({ email: "ronit@example.com", password: "demo" }));
    await waitFor(() => expect(result.current.session.data?.user.name).toBe("רונית ברש"));
  });

  it("loads the overview numbers", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useOverview(), { wrapper });
    await waitFor(() => expect(result.current.data?.openLeads).toBe(24));
  });

  it("changes a lead's status optimistically and refreshes the counts", async () => {
    const { wrapper, client } = setup();
    const { result } = renderHook(() => ({ lead: useLead("l-noa-biton"), counts: useLeadCounts(), update: useUpdateLeadStatus() }), { wrapper });
    await waitFor(() => expect(result.current.lead.data?.status).toBe("new"));
    act(() => result.current.update.mutate({ id: "l-noa-biton", status: "talking" }));
    await waitFor(() => expect(client.getQueryData<Lead>(queryKeys.lead("l-noa-biton"))?.status).toBe("talking"));
    await waitFor(() => expect(result.current.counts.data?.new).toBe(5));
  });

  it("rolls the status back when the update fails", async () => {
    const { services, wrapper, client } = setup();
    services.leads.updateStatus = async () => {
      throw new Error("boom");
    };
    const { result } = renderHook(() => ({ lead: useLead("l-noa-biton"), update: useUpdateLeadStatus() }), { wrapper });
    await waitFor(() => expect(result.current.lead.data?.status).toBe("new"));
    await act(async () => {
      await result.current.update.mutateAsync({ id: "l-noa-biton", status: "talking" }).catch(() => undefined);
    });
    expect(client.getQueryData<Lead>(queryKeys.lead("l-noa-biton"))?.status).toBe("new");
  });
});
