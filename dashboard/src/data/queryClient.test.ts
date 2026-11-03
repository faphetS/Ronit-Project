import { describe, expect, it } from "vitest";
import { queryKeys } from "./queries";
import { createQueryClient } from "./queryClient";
import type { SignedIn } from "./services";

const signedInAs = (id: string) => ({ user: { id } }) as SignedIn;

describe("createQueryClient", () => {
  it("keeps the data while the same person stays signed in", () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.session, signedInAs("u1"));
    client.setQueryData(queryKeys.groups, []);
    client.setQueryData(queryKeys.session, signedInAs("u1"));
    expect(client.getQueryData(queryKeys.groups)).toEqual([]);
  });

  it("drops the rest of the cache when someone else signs in, or the session ends", () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.session, signedInAs("u1"));
    client.setQueryData(queryKeys.groups, []);
    client.setQueryData(queryKeys.session, signedInAs("u2"));
    expect(client.getQueryData(queryKeys.groups)).toBeUndefined();

    client.setQueryData(queryKeys.groups, []);
    client.setQueryData(queryKeys.session, null);
    expect(client.getQueryData(queryKeys.groups)).toBeUndefined();
    expect(client.getQueryData(queryKeys.session)).toBeNull();
  });
});
