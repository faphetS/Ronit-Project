import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queries";
import type { SignedIn } from "./services";

/**
 * Data stays for the whole visit: a section opened again shows what it had at once, and refreshes behind it once it's
 * a minute old. It belongs to the person it was loaded for, so when the session ends, or someone else's begins (after
 * it ran out, or from another tab), the rest of the cache goes before it can show.
 */
export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, gcTime: Infinity, retry: 1, refetchOnWindowFocus: false } },
  });
  let signedInAs: string | null = null;
  client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryKey[0] !== queryKeys.session[0]) return;
    const userId = (event.query.state.data as SignedIn | null | undefined)?.user.id ?? null;
    if (userId === signedInAs) return;
    if (signedInAs !== null) {
      client.removeQueries({ predicate: ({ queryKey: [root] }) => root !== queryKeys.session[0] && root !== queryKeys.pendingCode[0] });
    }
    signedInAs = userId;
  });
  return client;
}
