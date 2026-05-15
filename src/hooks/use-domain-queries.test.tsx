import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  chainable,
  createSupabaseMock,
  resetSupabaseMock,
  type ChainableBuilder,
} from "@/test/supabase-mock";
import { createQueryWrapper } from "@/test/test-wrapper";

const mockSupabase = vi.hoisted(() => ({
  client: undefined as ReturnType<typeof createSupabaseMock> | undefined,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => mockSupabase.client,
}));

mockSupabase.client = createSupabaseMock();
const supabase = mockSupabase.client!;

beforeEach(() => {
  resetSupabaseMock(supabase);
});

const profile = {
  id: "user-1",
  email: "tanaka@example.com",
  username: "tanaka",
  display_name: "田中",
  avatar_url: null,
  current_project: null,
  bio: null,
  skill_tags: [],
  role: "user" as const,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

const tipRow = {
  id: "tip-1",
  author_id: "user-1",
  content: "気づき",
  is_anonymous: false,
  status: "published" as const,
  published_at: "2026-05-01T00:00:00.000Z",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  author: profile,
  tip_tags: [],
};

describe("useUserReactionTypesOnContent", () => {
  it("returns a Set of reaction_type strings the user has on this content", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({
        data: [
          { reaction_type: "same_thought" },
          { reaction_type: "learned" },
        ],
        error: null,
      }),
    );

    const { useUserReactionTypesOnContent } = await import(
      "./use-domain-queries"
    );
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useUserReactionTypesOnContent("user-1", "tip", "tip-1"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBeInstanceOf(Set);
    expect(Array.from(result.current.data!)).toEqual([
      "same_thought",
      "learned",
    ]);
  });

  it("is disabled until both userId and contentId are present", async () => {
    const { useUserReactionTypesOnContent } = await import(
      "./use-domain-queries"
    );
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useUserReactionTypesOnContent(undefined, "tip", "tip-1"),
      { wrapper },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("useTipsMapped", () => {
  it("fetches published tips and stitches in reactions + comment counts", async () => {
    // `fetchReactionSummaries` / `fetchCommentCounts` run in
    // `Promise.all`, so the relative order of `from("reactions")` and
    // `from("comments")` calls is non-deterministic. Dispatch by table
    // name and serve a "first page rows, then empty" shape via per-table
    // call counters.
    const callsByTable: Record<string, number> = {};
    supabase.from.mockImplementation(((table: string) => {
      const n = (callsByTable[table] ?? 0) + 1;
      callsByTable[table] = n;
      if (table === "tips") {
        return chainable({ data: [tipRow], error: null }) as unknown as
          ChainableBuilder;
      }
      if (table === "reactions") {
        if (n === 1) {
          return chainable({
            data: [
              { content_id: "tip-1", reaction_type: "same_thought" },
              { content_id: "tip-1", reaction_type: "same_thought" },
            ],
            error: null,
          }) as unknown as ChainableBuilder;
        }
        return chainable({ data: [], error: null }) as unknown as
          ChainableBuilder;
      }
      if (table === "comments") {
        if (n === 1) {
          return chainable({
            data: [{ content_id: "tip-1" }],
            error: null,
          }) as unknown as ChainableBuilder;
        }
        return chainable({ data: [], error: null }) as unknown as
          ChainableBuilder;
      }
      return chainable({ data: [], error: null }) as unknown as
        ChainableBuilder;
    }) as never);

    const { useTipsMapped } = await import("./use-domain-queries");
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useTipsMapped(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe("tip-1");
    expect(result.current.data![0].reactions.same_thought).toBe(2);
    expect(result.current.data![0].comment_count).toBe(1);
  });
});

describe("useTipByIdMapped", () => {
  it("fetches a single tip with its reaction/comment counts", async () => {
    supabase.from.mockImplementation(((table: string) => {
      if (table === "tips") {
        return chainable({ data: tipRow, error: null }) as unknown as
          ChainableBuilder;
      }
      // reactions/comments paginate; an immediately-empty page exits.
      return chainable({ data: [], error: null }) as unknown as
        ChainableBuilder;
    }) as never);

    const { useTipByIdMapped } = await import("./use-domain-queries");
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useTipByIdMapped("tip-1"), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.id).toBe("tip-1");
    expect(result.current.data!.author.username).toBe("tanaka");
  });

  it("is disabled when id is undefined", async () => {
    const { useTipByIdMapped } = await import("./use-domain-queries");
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useTipByIdMapped(undefined), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("useProfileByUsername", () => {
  it("fetches the profile row and returns it as the User domain shape", async () => {
    supabase.from.mockImplementationOnce(
      () =>
        chainable({ data: profile, error: null }) as unknown as ChainableBuilder,
    );

    const { useProfileByUsername } = await import("./use-domain-queries");
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useProfileByUsername("tanaka"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.profile.username).toBe("tanaka");
    expect(result.current.data!.userId).toBe("user-1");
  });
});

describe("useTrendingTags", () => {
  it("ranks tech and context tags separately by usage count", async () => {
    // fetchTagUsageCounts → 1) tags list, 2) tip_tags list
    supabase.from
      .mockImplementationOnce(() =>
        chainable({
          data: [
            { id: "t-react", name: "react", category: "tech" },
            { id: "t-wasm", name: "wasm", category: "tech" },
            { id: "t-learn", name: "学び", category: "context" },
            { id: "t-stuck", name: "ハマった", category: "context" },
            { id: "t-unused", name: "unused", category: "tech" },
          ],
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        chainable({
          data: [
            { tag_id: "t-react" },
            { tag_id: "t-react" },
            { tag_id: "t-react" },
            { tag_id: "t-wasm" },
            { tag_id: "t-learn" },
            { tag_id: "t-learn" },
            { tag_id: "t-stuck" },
          ],
          error: null,
        }),
      );

    const { useTrendingTags } = await import("./use-domain-queries");
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useTrendingTags(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.tech.map((r) => r.tag.name)).toEqual([
      "react",
      "wasm",
    ]);
    // Zero-count tags are filtered out.
    expect(
      result.current.data!.tech.find((r) => r.tag.name === "unused"),
    ).toBeUndefined();
    expect(result.current.data!.context.map((r) => r.tag.name)).toEqual([
      "学び",
      "ハマった",
    ]);
  });
});
