/** An item whose task failed, and why. */
export interface Failure<T> {
  item: T;
  error: unknown;
}

/**
 * Runs `task` on every item, at most `limit` at a time, and waits for all of them: one failing doesn't stop the rest.
 * Resolves with the failures, in the items' order.
 */
export async function settleEach<T>(items: readonly T[], limit: number, task: (item: T) => Promise<unknown>): Promise<Failure<T>[]> {
  const failed = new Map<number, unknown>();
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        await task(items[index] as T);
      } catch (error) {
        failed.set(index, error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return [...failed.keys()].sort((a, b) => a - b).map((index) => ({ item: items[index] as T, error: failed.get(index) }));
}
