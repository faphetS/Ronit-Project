import { describe, expect, it } from "vitest";
import { settleEach } from "./settle";

describe("settleEach", () => {
  it("runs every task, a few at a time, and hands back the ones that failed in order", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    const failed = await settleEach([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      if (n % 3 === 0) throw new Error(`no ${n}`);
      done.push(n);
    });
    expect(most).toBe(2);
    expect(done.sort()).toEqual([1, 2, 4, 5]);
    expect(failed.map((failure) => failure.item)).toEqual([3, 6]);
    expect(String(failed[0]?.error)).toContain("no 3");
  });

  it("does nothing for no items", async () => {
    expect(await settleEach([], 4, async () => {})).toEqual([]);
  });
});
