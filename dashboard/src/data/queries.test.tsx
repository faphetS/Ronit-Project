import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TestProviders, createTestClient, createTestServices } from "../test/app";
import { queryKeys, useCopyNow, useImportRun, useOverview, useSession, useStartGoogle, useVerifyCode } from "./queries";
import type { MondayCopy } from "./types";

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
  it("signs in through the emailed code and updates the session", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ session: useSession(), google: useStartGoogle(), verify: useVerifyCode() }), { wrapper });
    await waitFor(() => expect(result.current.session.isSuccess).toBe(true));
    expect(result.current.session.data).toBeNull();
    expect(await act(() => result.current.google.mutateAsync({ remember: false, returnTo: "/" }))).toEqual({ step: "code-required" });
    expect(result.current.session.data).toBeNull();
    await act(() => result.current.verify.mutateAsync("123456"));
    await waitFor(() => expect(result.current.session.data?.user.name).toBe("רונית ברש"));
  });

  it("loads the overview numbers", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useOverview(), { wrapper });
    await waitFor(() => expect(result.current.data?.openLeads).toBe(24));
  });

  it("shows a copy from Monday as running as soon as it starts", async () => {
    const { services, wrapper, client } = setup();
    // After the start, the server still answers with the last finished copy for a moment.
    services.imports.latest = async () => ({ ...(await createTestServices().imports.latest()) });
    const { result } = renderHook(() => ({ copy: useImportRun(), copyNow: useCopyNow() }), { wrapper });
    await waitFor(() => expect(result.current.copy.data?.lastRun?.status).toBe("completed"));
    let seen: string | undefined;
    const unsubscribe = client.getQueryCache().subscribe(() => {
      seen ??= client.getQueryData<MondayCopy>(queryKeys.importRun)?.lastRun?.status === "running" ? "running" : undefined;
    });
    await act(() => result.current.copyNow.mutateAsync());
    unsubscribe();
    expect(seen).toBe("running");
  });
});
