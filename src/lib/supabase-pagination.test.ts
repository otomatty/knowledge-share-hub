import { describe, it, expect } from "vitest";
import {
  DEFAULT_IN_CHUNK_SIZE,
  fetchAllPages,
  fetchAllPagesChunked,
  PAGE_SIZE,
} from "./supabase-pagination";

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

  it("fetchAllPagesChunked: splits ids into bounded chunks, merges the results", async () => {
    // 250 ids + 100-per-chunk → 3 chunks of sizes (100, 100, 50).
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const observedChunkSizes: number[] = [];
    const result = await fetchAllPagesChunked<string>(
      ids,
      async (chunk, from, to) => {
        // Only record on the initial (offset=0) call per chunk;
        // `fetchAllPages` always makes a follow-up empty-page request
        // to confirm exhaustion, which would otherwise double-count
        // the observed chunk sizes.
        if (from === 0) observedChunkSizes.push(chunk.length);
        if (from === 0) return { data: [...chunk], error: null };
        expect(to).toBeGreaterThanOrEqual(from);
        return { data: [], error: null };
      },
    );
    expect(observedChunkSizes).toEqual([100, 100, 50]);
    // Order preserved within each chunk; full coverage across all ids.
    expect(result).toHaveLength(250);
    expect(new Set(result)).toEqual(new Set(ids));
  });

  it("fetchAllPagesChunked: returns [] for empty ids without calling the builder", async () => {
    let called = false;
    const result = await fetchAllPagesChunked<string>([], async () => {
      called = true;
      return { data: [], error: null };
    });
    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it("fetchAllPagesChunked: DEFAULT_IN_CHUNK_SIZE keeps URL bytes bounded", () => {
    // This is a meta-test: the constant itself is the contract. If
    // someone bumps it, they need to have consciously checked the
    // resulting URL length against common proxy limits.
    expect(DEFAULT_IN_CHUNK_SIZE).toBeLessThanOrEqual(150);
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
