import { describe, it, expect } from "vitest";
import { fetchAllPages, PAGE_SIZE } from "./supabase-pagination";

/**
 * Mock builder that serves a fixed in-memory row set as if Supabase
 * returned it, optionally capped to `effectivePageSize` per request
 * (simulating a hosted project with `max_rows` configured below
 * PAGE_SIZE). Also records the `.range()` bounds of every call so
 * tests can assert the advance step.
 */
function mockBuilder<T>(rows: T[], effectivePageSize = PAGE_SIZE) {
  const calls: Array<{ from: number; to: number }> = [];
  const build = async (from: number, to: number) => {
    calls.push({ from, to });
    const requestedEnd = Math.min(to, rows.length - 1);
    const serverEnd = Math.min(from + effectivePageSize - 1, requestedEnd);
    const slice =
      from < rows.length ? rows.slice(from, serverEnd + 1) : [];
    return { data: slice, error: null };
  };
  return { build, calls };
}

describe("fetchAllPages", () => {
  it("returns a short result in a single page", async () => {
    const { build, calls } = mockBuilder([1, 2, 3]);
    const all = await fetchAllPages<number>(build);
    expect(all).toEqual([1, 2, 3]);
    // Two calls: first returns 3 rows, second confirms exhaustion.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ from: 0, to: PAGE_SIZE - 1 });
    expect(calls[1].from).toBe(3);
  });

  it("pages across multiple full pages", async () => {
    // Two full pages + a partial tail.
    const total = PAGE_SIZE * 2 + 5;
    const rows = Array.from({ length: total }, (_, i) => i);
    const { build, calls } = mockBuilder(rows);
    const all = await fetchAllPages<number>(build);
    expect(all).toHaveLength(total);
    expect(all[0]).toBe(0);
    expect(all[total - 1]).toBe(total - 1);
    // 3 data pages + 1 empty page to exit.
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.from)).toEqual([0, PAGE_SIZE, PAGE_SIZE * 2, total]);
  });

  it("handles a server whose max_rows is below PAGE_SIZE without skipping rows", async () => {
    // This is the scenario codex flagged: the server caps each request
    // at 500 rows even though the client asks for PAGE_SIZE. Advancing
    // by PAGE_SIZE (or exiting on rows.length < PAGE_SIZE) would miss
    // data. Advancing by rows.length and exiting on empty is correct.
    const CAP = 500;
    const total = 1250;
    const rows = Array.from({ length: total }, (_, i) => i);
    const { build, calls } = mockBuilder(rows, CAP);
    const all = await fetchAllPages<number>(build);
    expect(all).toHaveLength(total);
    // Every row, in order.
    for (let i = 0; i < total; i++) expect(all[i]).toBe(i);
    // 500 + 500 + 250 + 0-exit = 4 calls, advancing by actual row
    // counts (500, 500, 250) not by PAGE_SIZE.
    expect(calls.map((c) => c.from)).toEqual([0, 500, 1000, 1250]);
  });

  it("surfaces PostgrestError from the builder", async () => {
    const err = { message: "boom" } as unknown as {
      message: string;
      details: string;
      hint: string;
      code: string;
      name: string;
    };
    const failing = async () => ({
      data: null,
      error: err as unknown as Parameters<typeof fetchAllPages>[0] extends (
        f: number,
        t: number,
      ) => PromiseLike<infer R>
        ? R extends { error: infer E }
          ? E
          : never
        : never,
    });
    await expect(
      fetchAllPages(failing as never),
    ).rejects.toMatchObject({ message: "boom" });
  });
});
