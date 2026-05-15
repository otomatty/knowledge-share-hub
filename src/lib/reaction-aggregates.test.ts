import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  chainable,
  createSupabaseMock,
  resetSupabaseMock,
} from "@/test/supabase-mock";

// `src/lib/supabase.ts` calls `createClient(...)` at module load and the
// hooks here import that singleton. We mock the package so the call
// returns our shared mock instance, then keep that instance stable
// across tests (resetting state in beforeEach, not the reference).
const mockSupabase = vi.hoisted(() => {
  // Inline factory because vi.hoisted runs before any other imports.
  // Falls through to createSupabaseMock() once we can lazy-import.
  return { client: undefined as ReturnType<typeof createSupabaseMock> | undefined };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => mockSupabase.client,
}));

// Initialised at import time below; stable across the whole file.
mockSupabase.client = createSupabaseMock();
const supabase = mockSupabase.client!;

beforeEach(() => {
  resetSupabaseMock(supabase);
});

describe("emptyReactionSummary", () => {
  it("returns a fresh zeroed summary every call", async () => {
    const { emptyReactionSummary } = await import("./reaction-aggregates");
    const a = emptyReactionSummary();
    const b = emptyReactionSummary();
    expect(a).toEqual({
      same_thought: 0,
      new_view: 0,
      try_it: 0,
      learned: 0,
    });
    a.same_thought = 5;
    expect(b.same_thought).toBe(0);
  });
});

describe("fetchReactionSummaries", () => {
  it("short-circuits to {} for an empty contentIds array", async () => {
    const { fetchReactionSummaries } = await import("./reaction-aggregates");
    const out = await fetchReactionSummaries("tip", []);
    expect(out).toEqual({});
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("aggregates reaction rows into per-tip summaries and zero-fills missing tips", async () => {
    // First call returns rows; second call returns empty (terminates the
    // pagination loop in supabase-pagination.fetchAllPagesChunked).
    supabase.from
      .mockImplementationOnce(() =>
        chainable({
          data: [
            { content_id: "tip-1", reaction_type: "same_thought" },
            { content_id: "tip-1", reaction_type: "same_thought" },
            { content_id: "tip-1", reaction_type: "learned" },
            { content_id: "tip-2", reaction_type: "new_view" },
          ],
          error: null,
        }),
      )
      .mockImplementationOnce(() => chainable({ data: [], error: null }));

    const { fetchReactionSummaries } = await import("./reaction-aggregates");
    const out = await fetchReactionSummaries("tip", ["tip-1", "tip-2", "tip-3"]);
    expect(out["tip-1"]).toEqual({
      same_thought: 2,
      new_view: 0,
      try_it: 0,
      learned: 1,
    });
    expect(out["tip-2"]).toEqual({
      same_thought: 0,
      new_view: 1,
      try_it: 0,
      learned: 0,
    });
    // Tips with no reactions still get a zeroed summary so callers
    // don't have to special-case undefined.
    expect(out["tip-3"]).toEqual({
      same_thought: 0,
      new_view: 0,
      try_it: 0,
      learned: 0,
    });
  });

  it("propagates Supabase errors from the underlying query", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: null, error: { message: "boom" } }),
    );
    const { fetchReactionSummaries } = await import("./reaction-aggregates");
    await expect(fetchReactionSummaries("tip", ["tip-1"])).rejects.toMatchObject(
      { message: "boom" },
    );
  });
});

describe("fetchTagUsageCounts", () => {
  it("joins tags with tip_tags counts (zero for unused tags)", async () => {
    supabase.from
      .mockImplementationOnce(() =>
        chainable({
          data: [
            { id: "tag-1", name: "react", category: "tech" },
            { id: "tag-2", name: "ハマった", category: "context" },
            { id: "tag-3", name: "wasm", category: "tech" },
          ],
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        chainable({
          data: [
            { tag_id: "tag-1" },
            { tag_id: "tag-1" },
            { tag_id: "tag-2" },
          ],
          error: null,
        }),
      );

    const { fetchTagUsageCounts } = await import("./reaction-aggregates");
    const out = await fetchTagUsageCounts();
    expect(out).toEqual([
      { tag_id: "tag-1", name: "react", category: "tech", count: 2 },
      { tag_id: "tag-2", name: "ハマった", category: "context", count: 1 },
      { tag_id: "tag-3", name: "wasm", category: "tech", count: 0 },
    ]);
  });

  it("returns [] when there are no tags", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: [], error: null }),
    );
    const { fetchTagUsageCounts } = await import("./reaction-aggregates");
    expect(await fetchTagUsageCounts()).toEqual([]);
  });

  it("propagates the tags-side error", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: null, error: { message: "tags down" } }),
    );
    const { fetchTagUsageCounts } = await import("./reaction-aggregates");
    await expect(fetchTagUsageCounts()).rejects.toMatchObject({
      message: "tags down",
    });
  });
});

describe("fetchCommentCounts", () => {
  it("returns {} for empty contentIds without hitting Supabase", async () => {
    const { fetchCommentCounts } = await import("./reaction-aggregates");
    expect(await fetchCommentCounts("tip", [])).toEqual({});
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("counts comment rows per tip and zero-fills missing tips", async () => {
    supabase.from
      .mockImplementationOnce(() =>
        chainable({
          data: [
            { content_id: "tip-1" },
            { content_id: "tip-1" },
            { content_id: "tip-2" },
          ],
          error: null,
        }),
      )
      .mockImplementationOnce(() => chainable({ data: [], error: null }));

    const { fetchCommentCounts } = await import("./reaction-aggregates");
    const out = await fetchCommentCounts("tip", ["tip-1", "tip-2", "tip-3"]);
    expect(out).toEqual({ "tip-1": 2, "tip-2": 1, "tip-3": 0 });
  });
});
